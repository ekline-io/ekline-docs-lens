import {
  CATEGORY_WEIGHTS,
  type CategoryId,
  type CheckResult,
  type Severity,
} from "./types";

const SEVERITY_SCORE: Record<Severity, number> = {
  pass: 100,
  info: 100,
  warn: 60,
  fail: 0,
};

export function computeScore(checks: CheckResult[]) {
  const grouped: Record<CategoryId, CheckResult[]> = {
    discoverability: [],
    "content-accessibility": [],
    "page-size": [],
    "content-structure": [],
    "content-quality": [],
    "url-stability": [],
    observability: [],
    authentication: [],
    "capability-discovery": [],
  };
  for (const c of checks) grouped[c.category].push(c);

  const byCategory = {} as Record<CategoryId, { score: number; weight: number }>;
  for (const [cat, weight] of Object.entries(CATEGORY_WEIGHTS) as [CategoryId, number][]) {
    const group = grouped[cat];
    if (group.length === 0) {
      byCategory[cat] = { score: 100, weight };
      continue;
    }
    const avg = group.reduce((sum, c) => sum + SEVERITY_SCORE[c.severity], 0) / group.length;
    byCategory[cat] = { score: Math.round(avg), weight };
  }

  const totalWeight = Object.values(byCategory).reduce((s, c) => s + c.weight, 0);
  const overall = Math.round(
    Object.values(byCategory).reduce((s, c) => s + (c.score * c.weight) / totalWeight, 0),
  );

  return { overall, grade: grade(overall), byCategory };
}

function grade(score: number): string {
  if (score === 100) return "A+";
  if (score >= 97) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 61) return "D";
  return "F";
}
