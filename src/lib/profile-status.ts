import type { SiteStats } from "@/lib/core/run-types";
import type { ProfileId } from "@/lib/core/types";

export type ProfileStatus = "good" | "partial" | "broken";

/**
 * Derive a per-profile status from site-stats. A profile is:
 *   - "broken" if it produced no content,
 *   - "partial" if it saw less than half what headless saw, or
 *   - "good" otherwise.
 *
 * Headless is the reference because it sees the most. If it itself is broken
 * we mark all three as broken — there's no useful comparator.
 */
export function deriveStatuses(
  stats: SiteStats | null,
): Record<ProfileId, ProfileStatus> {
  if (!stats)
    return { rawHttp: "broken", headless: "broken", snippet: "broken" };
  const totals = stats.avgTokensClaudePerProfile;
  const headless = totals.headless ?? 0;
  const result: Record<ProfileId, ProfileStatus> = {
    rawHttp: "broken",
    headless: "broken",
    snippet: "broken",
  };
  for (const id of ["rawHttp", "headless", "snippet"] as const) {
    const t = totals[id] ?? 0;
    if (t === 0) result[id] = "broken";
    else if (headless > 0 && t / headless < 0.5) result[id] = "partial";
    else result[id] = "good";
  }
  return result;
}
