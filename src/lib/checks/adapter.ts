import type { FixFinding } from "@/lib/fix/types";
import type { CheckResult } from "@/lib/types";
import { checkWellKnown, checkRobotsAndSignals } from "./well-known";
import { checkOAuthDiscovery, checkOAuthProtectedResource } from "./oauth";
import { checkSitemap } from "./sitemap";
import { checkLinkHeaders } from "./discovery-extras";
import { checkAiBotRules } from "./ai-bots";
import { checkWebBotAuth } from "./bot-auth";
import { checkA2AAgentCard } from "./a2a";

/**
 * Run the AFDocs-style site-level probes (llms.txt, /.well-known/*, robots,
 * content negotiation, markdown URL alternative) and return the failing /
 * warning ones as FixFindings.
 *
 * These checks already exist as part of the legacy /api/crawl pipeline.
 * Rather than rewrite them per-profile (most don't have a per-profile
 * meaning — they're properties of the host, not the page), we run them
 * once per scan against the seed URL and surface them in the unified fix
 * list. Pass-severity checks are ignored — they'd just be noise in the fix
 * list, which is for things to *do*.
 */
export async function runSiteChecks(seedUrl: string): Promise<{
  findings: FixFinding[];
  allChecks: CheckResult[];
}> {
  // These are the Docs Lens-specific site-level probes. afdocs covers the
  // AFDocs Spec checks via its own runner (see src/lib/afdocs/runner.ts);
  // we only run what afdocs doesn't.
  const [
    wellKnown,
    robots,
    oauth,
    oauthRes,
    sitemap,
    linkHeaders,
    aiBotRules,
    webBotAuth,
    a2a,
  ] = await Promise.all([
    safe(() => checkWellKnown(seedUrl)),
    safe(() => checkRobotsAndSignals(seedUrl)),
    safe(() => checkOAuthDiscovery(seedUrl)),
    safe(() => checkOAuthProtectedResource(seedUrl)),
    safe(() => checkSitemap(seedUrl)),
    safe(() => checkLinkHeaders(seedUrl)),
    safe(() => checkAiBotRules(seedUrl)),
    safe(() => checkWebBotAuth(seedUrl)),
    safe(() => checkA2AAgentCard(seedUrl)),
  ]);
  const all = [
    ...wellKnown,
    ...robots,
    ...oauth,
    ...oauthRes,
    ...sitemap,
    ...linkHeaders,
    ...aiBotRules,
    ...webBotAuth,
    ...a2a,
  ].filter((c): c is CheckResult => Boolean(c));
  const findings = all
    .filter((c) => c.severity !== "pass" && c.severity !== "info")
    .map((c) => toFinding(c, seedUrl));
  return { findings, allChecks: all };
}

async function safe<T extends CheckResult | CheckResult[]>(
  fn: () => Promise<T>,
): Promise<CheckResult[]> {
  try {
    const r = await fn();
    return Array.isArray(r) ? r : [r];
  } catch {
    return [];
  }
}

function toFinding(c: CheckResult, pageUrl: string): FixFinding {
  return {
    id: `check:${c.id}`,
    title: c.title || c.id,
    severity: mapSeverity(c.severity),
    source: "check",
    evidence: c.message ?? "",
    affectedProfiles: "general",
    fixHint: c.source ? `See ${c.source}` : "Resolve per AFDocs guidance",
    pageUrl,
    occurrences: 1,
    audit: c.audit,
    conclusion: c.conclusion,
  };
}

function mapSeverity(s: CheckResult["severity"]): FixFinding["severity"] {
  if (s === "fail") return "fail";
  if (s === "warn") return "warn";
  return "info";
}

/**
 * Aggregate per-page check results into one site-level CheckResult per id.
 *
 * Severity rolls up worst-first: any fail -> fail; any warn -> warn; any
 * pass -> pass; otherwise info. The representative CheckResult (audit /
 * conclusion / fix) is borrowed from the worst-severity occurrence so the
 * UI surfaces the most actionable evidence.
 */
export function aggregatePageChecks(perPage: CheckResult[][]): CheckResult[] {
  const byId = new Map<string, CheckResult[]>();
  for (const pageResults of perPage) {
    for (const c of pageResults) {
      const list = byId.get(c.id) ?? [];
      list.push(c);
      byId.set(c.id, list);
    }
  }
  const out: CheckResult[] = [];
  for (const [id, results] of byId) {
    const totals: Record<CheckResult["severity"], number> = {
      fail: 0,
      warn: 0,
      pass: 0,
      info: 0,
    };
    for (const r of results) totals[r.severity]++;
    let severity: CheckResult["severity"];
    if (totals.fail > 0) severity = "fail";
    else if (totals.warn > 0) severity = "warn";
    else if (totals.pass > 0) severity = "pass";
    else severity = "info";

    // Pick a representative — the worst-severity page result so audit/fix
    // copy comes from the most actionable example.
    const order: CheckResult["severity"][] = ["fail", "warn", "info", "pass"];
    const rep = order
      .flatMap((s) => results.filter((r) => r.severity === s))[0]!;
    const affectedSeverityCount = totals[severity];
    const totalPages = results.length;
    const affectedUrls = results
      .filter((r) => r.severity === severity)
      .map((r) => (r.details?.pageUrl as string) ?? "")
      .filter(Boolean);

    const verb =
      severity === "fail"
        ? "failed"
        : severity === "warn"
          ? "have warnings"
          : severity === "info"
            ? "are inconclusive"
            : "passed";

    out.push({
      ...rep,
      severity,
      message:
        severity === "pass"
          ? `All ${totalPages} pages passed.`
          : `${affectedSeverityCount} of ${totalPages} pages ${verb}: ${affectedUrls.slice(0, 3).join(", ")}${affectedUrls.length > 3 ? ` (+${affectedUrls.length - 3} more)` : ""}`,
      conclusion:
        severity === "pass"
          ? `${totalPages}/${totalPages} pages clean for ${id}`
          : `${affectedSeverityCount}/${totalPages} pages ${severity}`,
      details: {
        ...(rep.details ?? {}),
        affectedPages: affectedUrls,
        totalPages,
        perSeverity: totals,
      },
    });
  }
  return out;
}
