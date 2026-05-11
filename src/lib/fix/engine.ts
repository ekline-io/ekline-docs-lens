import type { FixFinding, FixSeverity, FixSource } from "./types";
import { attributionFor } from "./attribution";

const SEVERITY_RANK: Record<FixSeverity, number> = {
  fail: 0,
  warn: 1,
  info: 2,
};

const SOURCE_RANK: Record<FixSource, number> = {
  check: 0,
  diff: 1,
};

/**
 * Merge findings from across all pages of a run, dedupe by `id`, apply
 * attribution from the static map, and rank for the fix list.
 *
 * Ranking rules (in order):
 *   1. Severity (fail > warn > info)
 *   2. Site-wide occurrence count (more first)
 *   3. Source priority (check > diff)
 *   4. Stable by id for deterministic UI output
 */
export function mergeAndRank(findings: FixFinding[]): FixFinding[] {
  const byId = new Map<string, FixFinding>();
  for (const f of findings) {
    const existing = byId.get(f.id);
    if (existing) {
      existing.occurrences += f.occurrences;
      continue;
    }
    byId.set(f.id, {
      ...f,
      affectedProfiles: attributionFor(f.id),
    });
  }
  return [...byId.values()].sort((a, b) => {
    const sev = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (sev !== 0) return sev;
    const occ = b.occurrences - a.occurrences;
    if (occ !== 0) return occ;
    const src = SOURCE_RANK[a.source] - SOURCE_RANK[b.source];
    if (src !== 0) return src;
    return a.id.localeCompare(b.id);
  });
}
