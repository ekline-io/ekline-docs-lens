import { PROFILE_IDS } from "@/lib/core/types";
import type { ProfileId } from "@/lib/core/types";
import type { PageResult, SiteStats } from "@/lib/core/run-types";

/**
 * Site-wide rollups. Inputs:
 *   - pages: scan results, each with .diff already computed by the runner
 *   - discoverMeta: where the page list came from + whether the cap was hit
 *   - fixBacklog: count of fail/warn fixes the FixEngine produced
 *
 * Averages are arithmetic means over pages; missing/zero profiles count as 0
 * in the per-profile token average so empty slots don't lie about coverage.
 */
export function computeSiteStats(
  pages: PageResult[],
  discoverMeta: { source: "sitemap" | "bfs"; capped: boolean },
  fixBacklog: number,
): SiteStats {
  const n = pages.length;
  const avgTokensClaudePerProfile = {} as Record<ProfileId, number>;
  for (const id of PROFILE_IDS) avgTokensClaudePerProfile[id] = 0;

  if (n === 0) {
    return {
      pagesScanned: 0,
      source: discoverMeta.source,
      capped: discoverMeta.capped,
      avgJsGatedFraction: 0,
      avgTokensClaudePerProfile,
      fixBacklog,
    };
  }

  let jsTotal = 0;
  for (const page of pages) {
    if (page.diff) {
      jsTotal += page.diff.jsGatedFraction;
    }
    for (const id of PROFILE_IDS) {
      avgTokensClaudePerProfile[id] += page.profiles[id]?.tokensClaude ?? 0;
    }
  }
  for (const id of PROFILE_IDS) {
    avgTokensClaudePerProfile[id] = Math.round(avgTokensClaudePerProfile[id] / n);
  }
  return {
    pagesScanned: n,
    source: discoverMeta.source,
    capped: discoverMeta.capped,
    avgJsGatedFraction: jsTotal / n,
    avgTokensClaudePerProfile,
    fixBacklog,
  };
}
