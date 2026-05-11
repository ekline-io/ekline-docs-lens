import { PROFILE_IDS } from "@/lib/core/types";
import type { ProfileId } from "@/lib/core/types";
import type { PageDiff, PageResult } from "@/lib/core/run-types";

/**
 * Compute the per-page diff: which profile saw the most content, what
 * fraction of that the others saw, and the JS-gated %.
 *
 * The Runner already calls this internally; the function lives here so the
 * diff layer is independently testable and so future per-profile drilldowns
 * can recompute on demand.
 */
export function computePageDiff(page: PageResult): PageDiff {
  let largestProfile: ProfileId = "rawHttp";
  let largestChars = 0;
  for (const id of PROFILE_IDS) {
    const c = page.profiles[id]?.chars ?? 0;
    if (c > largestChars) {
      largestChars = c;
      largestProfile = id;
    }
  }
  const charsFraction = {} as Record<ProfileId, number>;
  for (const id of PROFILE_IDS) {
    const c = page.profiles[id]?.chars ?? 0;
    charsFraction[id] = largestChars > 0 ? c / largestChars : 0;
  }
  const headlessChars = page.profiles.headless?.chars ?? 0;
  const rawChars = page.profiles.rawHttp?.chars ?? 0;
  return {
    largestProfile,
    charsFraction,
    jsGatedFraction: clamp01(
      headlessChars > 0 ? (headlessChars - rawChars) / headlessChars : 0,
    ),
  };
}

export function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}
