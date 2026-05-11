import type { RunResult, SiteStats } from "@/lib/core/run-types";
import type { FixFinding } from "@/lib/fix/types";

export interface RunDelta {
  /** "before" run = the older one. */
  before: { id: string; finishedAt: number };
  after: { id: string; finishedAt: number };
  /** Set difference of page URLs that exist in `after` but not `before`. */
  newPages: string[];
  /** Pages dropped between the two runs (in `before` but not `after`). */
  removedPages: string[];
  /** Pages present in both. */
  commonPages: number;
  /** Site-stats delta — `null` if either run has no stats yet. */
  siteStats: SiteStatsDelta | null;
  /** Findings present in `after` that were not in `before` (by id). */
  newFindings: FixFinding[];
  /** Findings present in `before` that are gone in `after`. */
  resolvedFindings: FixFinding[];
  /** Findings present in both but with a different occurrence count. */
  changedFindings: Array<{ before: FixFinding; after: FixFinding; delta: number }>;
}

export interface SiteStatsDelta {
  pagesScanned: { before: number; after: number; delta: number };
  avgJsGatedFraction: { before: number; after: number; delta: number };
  fixBacklog: { before: number; after: number; delta: number };
}

/**
 * Diff two completed RunResults. The convention is `before` is the older
 * snapshot and `after` is the newer; if `after.finishedAt` < `before.finishedAt`
 * we transparently swap them so the result always reflects the chronological
 * direction (so a re-scan diff "shows what got better" regardless of URL
 * ordering).
 */
export function diffRuns(a: RunResult, b: RunResult): RunDelta {
  const aTime = a.finishedAt ?? a.startedAt;
  const bTime = b.finishedAt ?? b.startedAt;
  const before = aTime <= bTime ? a : b;
  const after = aTime <= bTime ? b : a;

  const beforeUrls = new Set(before.pages.map((p) => p.url));
  const afterUrls = new Set(after.pages.map((p) => p.url));
  const newPages = [...afterUrls].filter((u) => !beforeUrls.has(u));
  const removedPages = [...beforeUrls].filter((u) => !afterUrls.has(u));
  const commonPages = [...beforeUrls].filter((u) => afterUrls.has(u)).length;

  const beforeFixes = new Map(before.fixes.map((f) => [f.id, f]));
  const afterFixes = new Map(after.fixes.map((f) => [f.id, f]));

  const newFindings: FixFinding[] = [];
  const resolvedFindings: FixFinding[] = [];
  const changedFindings: RunDelta["changedFindings"] = [];

  for (const [id, after_] of afterFixes) {
    const before_ = beforeFixes.get(id);
    if (!before_) {
      newFindings.push(after_);
    } else if (after_.occurrences !== before_.occurrences) {
      changedFindings.push({
        before: before_,
        after: after_,
        delta: after_.occurrences - before_.occurrences,
      });
    }
  }
  for (const [id, before_] of beforeFixes) {
    if (!afterFixes.has(id)) resolvedFindings.push(before_);
  }

  return {
    before: { id: before.id, finishedAt: before.finishedAt ?? before.startedAt },
    after: { id: after.id, finishedAt: after.finishedAt ?? after.startedAt },
    newPages,
    removedPages,
    commonPages,
    siteStats: deltaSiteStats(before.siteStats, after.siteStats),
    newFindings,
    resolvedFindings,
    changedFindings,
  };
}

function deltaSiteStats(
  a: SiteStats | undefined,
  b: SiteStats | undefined,
): SiteStatsDelta | null {
  if (!a || !b) return null;
  return {
    pagesScanned: pair(a.pagesScanned, b.pagesScanned),
    avgJsGatedFraction: pair(a.avgJsGatedFraction, b.avgJsGatedFraction),
    fixBacklog: pair(a.fixBacklog, b.fixBacklog),
  };
}

function pair(before: number, after: number) {
  return { before, after, delta: after - before };
}
