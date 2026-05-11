import type { RunResult } from "@/lib/core/run-types";
import type { ProfileId } from "@/lib/core/types";
import type { PageProgress, ScanState } from "@/hooks/useScanRun";

/**
 * Build a fully-populated ScanState from a final RunResult. Used when we
 * skip the live SSE pipeline (sync scan path) and need to drive the UI
 * straight from a snapshot already in hand.
 */
export function scanStateFromResult(result: RunResult): ScanState {
  const pages: PageProgress[] = result.pages.map((p, i) => {
    const charsByProfile: Partial<Record<ProfileId, number>> = {};
    const tokensByProfile: Partial<Record<ProfileId, number>> = {};
    for (const [profileId, summary] of Object.entries(p.summary)) {
      charsByProfile[profileId as ProfileId] = summary.chars;
      tokensByProfile[profileId as ProfileId] = summary.tokensClaude;
    }
    return {
      url: p.url,
      index: i,
      charsByProfile,
      tokensByProfile,
      diff: p.diff,
      done: true,
    };
  });

  return {
    status: result.status === "stopped" ? "stopped" : "done",
    discover: {
      pages: result.pages.map((p) => p.url),
      source: result.siteStats?.source ?? "bfs",
      capped: result.siteStats?.capped ?? false,
    },
    pages,
    pagesDone: pages.length,
    totalPages: pages.length,
    siteStats: result.siteStats,
    fixes: result.fixes,
    errorMessage: result.errorMessage,
    result,
  };
}
