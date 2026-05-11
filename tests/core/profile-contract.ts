import { expect } from "vitest";
import type { Profile } from "@/lib/core/profile";
import type { ProfileResult } from "@/lib/core/types";

export function assertProfileShape(r: ProfileResult, expectedId: string) {
  expect(r.id).toBe(expectedId);
  expect(typeof r.ok).toBe("boolean");
  expect(r.bytes).toBeGreaterThanOrEqual(0);
  expect(r.chars).toBeGreaterThanOrEqual(0);
  expect(r.tokensClaude).toBeGreaterThanOrEqual(0);
  expect(r.tokensGpt).toBeGreaterThanOrEqual(0);
  expect(typeof r.markdown).toBe("string");
  expect(r.durationMs).toBeGreaterThanOrEqual(0);
  if (!r.ok) expect(typeof r.reason).toBe("string");
}

export function assertProfileInterface<T extends Profile>(p: T, id: string) {
  expect(p.id).toBe(id);
  expect(typeof p.fetch).toBe("function");
}
