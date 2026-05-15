import { BrowserPool } from "./browser-pool";
import { runProfile, allProfiles } from "./registry";
import { DEFAULT_FETCH_CONTEXT, PROFILE_IDS } from "./types";
import type { FetchContext, ProfileId, ProfileResult } from "./types";
import type {
  PageResult,
  PageProfileSummary,
  RunConfig,
  RunEvent,
  RunResult,
} from "./run-types";
import { discoverPages } from "@/lib/crawl/discover";
import { computePageDiff } from "@/lib/diff/profile-diff";
import { computeSiteStats } from "@/lib/diff/site-stats";
import { mergeAndRank } from "@/lib/fix/engine";
import { runSiteChecks, aggregatePageChecks } from "@/lib/checks/adapter";
import { runPageChecks } from "@/lib/checks/page-checks";
import { runAfdocsChecks } from "@/lib/afdocs/runner";
import type { FixFinding } from "@/lib/fix/types";
import type { CheckResult } from "@/lib/types";

export interface RunnerOptions {
  browserMaxContexts?: number;
  userAgent?: string;
  timeoutMs?: number;
}

/**
 * Runner ties together the BrowserPool, the profile registry, and the per-page
 * fan-out. Owns lifecycle of the browser; callers must `close()` when done.
 *
 * Plan-2 scope: scanPage (six profiles in parallel for one URL) + scanSite
 * (which adds the crawler + concurrent page fan-out + event emission). The
 * site-stats / fix list / prose layer are wired in by Plan 2's later tasks.
 */
export class Runner {
  private pool: BrowserPool;
  private userAgent: string;
  private timeoutMs: number;

  constructor(opts: RunnerOptions = {}) {
    this.userAgent = opts.userAgent ?? DEFAULT_FETCH_CONTEXT.userAgent;
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_FETCH_CONTEXT.timeoutMs;
    this.pool = new BrowserPool({
      maxContexts: opts.browserMaxContexts ?? 4,
      userAgent: this.userAgent,
      // Sparticuz/chromium-min runs Chromium in --single-process mode, which
      // leaks sockets / FDs / TIME_WAITs between contexts. After ~1 page,
      // page.goto fails with net::ERR_INSUFFICIENT_RESOURCES. Recycle the
      // browser process per page on Vercel — each page gets a pristine
      // network stack. ~3-5s relaunch cost per page, fits 300s budget.
      recyclePerPage: process.env.VERCEL === "1",
    });
  }

  /**
   * Run all six profiles for a single URL in parallel. Failures in any one
   * profile are caught and reported as ok=false in that slot rather than
   * failing the whole page.
   */
  async scanPage(url: string): Promise<PageResult> {
    const ctx: FetchContext = {
      url,
      userAgent: this.userAgent,
      timeoutMs: this.timeoutMs,
    };
    const profiles = allProfiles().map((p) => p.id);
    const results = await Promise.all(
      profiles.map((id) => this.runOne(id, ctx)),
    );
    const profileMap = {} as Record<ProfileId, ProfileResult>;
    const summary = {} as Record<ProfileId, PageProfileSummary>;
    for (const r of results) {
      profileMap[r.id] = r;
      summary[r.id] = {
        id: r.id,
        ok: r.ok,
        reason: r.reason,
        chars: r.chars,
        tokensClaude: r.tokensClaude,
        tokensGpt: r.tokensGpt,
        durationMs: r.durationMs,
      };
    }
    return { url, profiles: profileMap, summary };
  }

  private async runOne(id: ProfileId, ctx: FetchContext): Promise<ProfileResult> {
    const start = Date.now();
    try {
      return await runProfile(id, ctx, { pool: this.pool });
    } catch (e) {
      return {
        id,
        ok: false,
        reason: e instanceof Error ? e.message : "profile threw",
        bytes: 0,
        chars: 0,
        tokensClaude: 0,
        tokensGpt: 0,
        markdown: "",
        durationMs: Date.now() - start,
      };
    }
  }

  /**
   * Scan an entire site starting from a seed URL. Calls `discoverPages` to
   * get the page list, then fans out `scanPage` across pages with bounded
   * concurrency. Emits events through `onEvent` so callers (the SSE route)
   * can stream progress.
   *
   * Plan-2 carryover: site-stats, prose layer, and fix engine are wired in
   * by O1; this method currently returns a `RunResult` with empty `fixes`
   * and no `siteStats`. R3 just lays the orchestration spine.
   */
  async scanSite(
    config: RunConfig,
    onEvent: (e: RunEvent) => void = () => {},
    shouldStop: () => boolean = () => false,
  ): Promise<RunResult> {
    const id = newRunId();
    const startedAt = Date.now();
    const cap = config.cap ?? 10;
    const pageConcurrency = config.pageConcurrency ?? 4;
    const discovered = await discoverPages(config.rootUrl, {
      cap,
      userAgent: this.userAgent,
      timeoutMs: this.timeoutMs,
    });
    onEvent({
      type: "discover",
      pages: discovered.pages,
      source: discovered.source,
      capped: discovered.capped,
    });

    const pages: PageResult[] = [];
    const allFindings: FixFinding[] = [];
    let nextIndex = 0;
    const total = discovered.pages.length;
    let stopped = false;

    const worker = async () => {
      while (true) {
        if (shouldStop()) {
          stopped = true;
          return;
        }
        const i = nextIndex++;
        if (i >= total) return;
        const url = discovered.pages[i]!;
        onEvent({ type: "page:start", url, index: i });
        const page = await this.scanPage(url);
        for (const id of PROFILE_IDS) {
          const r = page.profiles[id];
          onEvent({
            type: "profile:done",
            url,
            profile: id,
            ok: r.ok,
            chars: r.chars,
            tokensClaude: r.tokensClaude,
            durationMs: r.durationMs,
          });
        }
        const diff = computePageDiff(page);
        page.diff = diff;
        pages[i] = page;
        onEvent({ type: "page:done", url, index: i, diff });
      }
    };

    // Run page-level work, our site-level probes, and the afdocs sub-runner
    // concurrently. Our probes hit different endpoints (sitemap, well-known,
    // robots) than the page fan-out; afdocs runs its own crawl with its own
    // rate limiter and doesn't compete with our browser pool.
    const [, siteCheckResult, afdocsResult] = await Promise.all([
      Promise.all(
        Array.from({ length: Math.max(1, Math.min(pageConcurrency, total)) }, () => worker()),
      ),
      runSiteChecks(config.rootUrl),
      runAfdocsChecks(config.rootUrl, { samplingStrategy: "deterministic" }),
    ]);
    const { findings: siteCheckFindings, allChecks: rawSiteChecks } = siteCheckResult;
    allFindings.push(...siteCheckFindings);
    // afdocs is the source of truth for the 23 check IDs it ships. Our
    // implementations for those IDs (if any leaked through) are suppressed
    // so the user sees one verdict per ID, sourced from afdocs.
    const afdocsIds = new Set(afdocsResult.results.map((r) => r.id));
    const siteChecks = rawSiteChecks.filter((c) => !afdocsIds.has(c.id));
    for (const c of afdocsResult.results) {
      if (c.severity === "fail" || c.severity === "warn") {
        allFindings.push(checkToFinding(c));
      }
    }

    // Drop holes left by stopped workers (when stop arrives mid-fan-out the
     // pages array is sparse). The site-stats layer treats undefined pages as
     // zero, but emitted pages should be an actual array.
    const finishedPages = pages.filter((p): p is PageResult => !!p);

    // Per-page checks fan out over each page's profile output and roll up
    // into one CheckResult per id (worst-severity wins). Their findings
    // join the fix engine alongside the site-level probes; their
    // CheckResults join the all-checks list. We also stash the raw per-page
    // results on each PageResult so the drilldown route can render them
    // without re-running the checks.
    const perPageChecks = await Promise.all(
      finishedPages.map((p) => runPageChecks(p)),
    );
    finishedPages.forEach((p, i) => {
      p.pageChecks = perPageChecks[i];
    });
    // Aggregated per-page checks are also gated by afdocs's IDs — afdocs
    // owns the canonical verdict for any ID it ships, regardless of whether
    // ours ran site-wide or per-page.
    const aggregatedPageChecks = aggregatePageChecks(perPageChecks).filter(
      (c) => !afdocsIds.has(c.id),
    );
    for (const c of aggregatedPageChecks) {
      if (c.severity === "fail" || c.severity === "warn") {
        allFindings.push(pageCheckToFinding(c));
      }
    }

    const fixes = mergeAndRank(allFindings);
    const fixBacklog = fixes.filter((f) => f.severity !== "info").length;
    const siteStats = computeSiteStats(
      finishedPages,
      { source: discovered.source, capped: discovered.capped },
      fixBacklog,
    );
    if (stopped) {
      onEvent({
        type: "run:stopped",
        siteStats,
        fixes,
        reason: `stopped after ${finishedPages.length} of ${total} pages`,
      });
    } else {
      onEvent({ type: "run:done", siteStats, fixes });
    }
    const result: RunResult = {
      id,
      config,
      status: stopped ? "stopped" : "done",
      startedAt,
      finishedAt: Date.now(),
      pages: finishedPages,
      siteStats,
      fixes,
      siteChecks: [...siteChecks, ...aggregatedPageChecks, ...afdocsResult.results],
    };
    return result;
  }

  async close(): Promise<void> {
    await this.pool.close();
  }
}

function newRunId(): string {
  return `run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Convert an aggregated per-page CheckResult into a FixFinding so the fix
 * engine can rank it alongside site-level findings. We pick the first
 * affected URL as the page reference and pull occurrences from
 * details.perSeverity, falling back to 1.
 */
/**
 * Convert an afdocs-sourced CheckResult into a FixFinding so the fix engine
 * ranks it alongside our own. afdocs results don't carry per-page detail in
 * the shape our pageCheckToFinding expects (it does its own sampling), so
 * we flatten into a single general finding.
 */
function checkToFinding(c: CheckResult): FixFinding {
  return {
    id: `check:${c.id}`,
    title: c.title || c.id,
    severity: c.severity === "fail" ? "fail" : c.severity === "warn" ? "warn" : "info",
    source: "check",
    evidence: c.message ?? "",
    affectedProfiles: "general",
    fixHint: c.fix ?? (c.source ? `See ${c.source}` : "Resolve per AFDocs guidance"),
    pageUrl: "",
    occurrences: 1,
    audit: c.audit,
    conclusion: c.conclusion,
  };
}

function pageCheckToFinding(c: CheckResult): FixFinding {
  const affected = (c.details?.affectedPages as string[] | undefined) ?? [];
  const perSeverity = c.details?.perSeverity as
    | Record<CheckResult["severity"], number>
    | undefined;
  const occurrences =
    (perSeverity?.fail ?? 0) + (perSeverity?.warn ?? 0) || affected.length || 1;
  return {
    id: `check:${c.id}`,
    title: c.title || c.id,
    severity: c.severity === "fail" ? "fail" : c.severity === "warn" ? "warn" : "info",
    source: "check",
    evidence: c.message ?? "",
    affectedProfiles: "general",
    fixHint: c.fix ?? (c.source ? `See ${c.source}` : "Resolve per AFDocs guidance"),
    pageUrl: affected[0] ?? "",
    occurrences,
    audit: c.audit,
    conclusion: c.conclusion,
  };
}

/** Re-exported so callers don't need to know about PROFILE_IDS layout. */
export { PROFILE_IDS };
export type { RunConfig, RunEvent };
