/**
 * Status band: the four-level human-readable verdict that the result hero and
 * the homepage example cards both lead with. One source of truth — bandFor
 * computes the band from fail/warn counts; BAND_CLASSES maps tone to the
 * Tailwind classes the UI uses for pills, tiles, and rings.
 */

export type BandTone = "ok" | "warn" | "alert";

export interface Band {
  label: string;
  tone: BandTone;
}

export function bandFor(failCount: number, warnCount: number): Band {
  const issues = failCount + warnCount;
  if (issues === 0) return { label: "Agent-ready", tone: "ok" };
  if (failCount === 0 && issues <= 2) return { label: "Mostly readable", tone: "warn" };
  if (failCount <= 2 && issues <= 5) return { label: "Needs work", tone: "warn" };
  return { label: "Broken for agents", tone: "alert" };
}

/** Class bundles per tone. Pick the variant that matches the surface. */
export const BAND_CLASSES: Record<
  BandTone,
  { pill: string; tile: string; valueText: string }
> = {
  ok: {
    pill: "bg-emerald-50 text-emerald-800 border-emerald-200",
    tile: "border-emerald-200 bg-emerald-50/60",
    valueText: "text-emerald-800",
  },
  warn: {
    pill: "bg-amber-50 text-amber-800 border-amber-200",
    tile: "border-amber-200 bg-amber-50/60",
    valueText: "text-amber-800",
  },
  alert: {
    pill: "bg-rose-50 text-rose-800 border-rose-200",
    tile: "border-rose-200 bg-rose-50/60",
    valueText: "text-rose-800",
  },
};
