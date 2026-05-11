import { describe, it, expect } from "vitest";
import { computeSiteStats } from "@/lib/diff/site-stats";
import type { PageResult } from "@/lib/core/run-types";
import type { ProfileResult, ProfileId } from "@/lib/core/types";
import { PROFILE_IDS } from "@/lib/core/types";

function makeProfile(id: ProfileId, chars: number, ok = true): ProfileResult {
  return {
    id,
    ok,
    bytes: chars,
    chars,
    tokensClaude: Math.round(chars / 4),
    tokensGpt: Math.round(chars / 4),
    markdown: ok ? "x".repeat(chars) : "",
    durationMs: 1,
    reason: ok ? undefined : "stub",
  };
}

function makePage(url: string, charsByProfile: Record<ProfileId, number>): PageResult {
  const profiles = {} as Record<ProfileId, ProfileResult>;
  const summary = {} as PageResult["summary"];
  for (const id of PROFILE_IDS) {
    const c = charsByProfile[id];
    profiles[id] = makeProfile(id, c);
    summary[id] = {
      id,
      ok: true,
      chars: c,
      tokensClaude: Math.round(c / 4),
      tokensGpt: Math.round(c / 4),
      durationMs: 1,
    };
  }
  return { url, profiles, summary };
}

describe("computeSiteStats", () => {
  it("computes averages across pages", () => {
    const p1 = makePage("https://x/1", {
      rawHttp: 100,
      headless: 200,
      snippet: 50,
    });
    const p2 = makePage("https://x/2", {
      rawHttp: 200,
      headless: 400,
      snippet: 50,
    });
    p1.diff = {
      largestProfile: "headless",
      charsFraction: {
        rawHttp: 0.5,
        headless: 1,
        snippet: 0.25,
      },
      jsGatedFraction: 0.5, // (200-100)/200
    };
    p2.diff = {
      largestProfile: "headless",
      charsFraction: {
        rawHttp: 0.5,
        headless: 1,
        snippet: 0.125,
      },
      jsGatedFraction: 0.5, // (400-200)/400
    };
    const stats = computeSiteStats(
      [p1, p2],
      { source: "sitemap", capped: false },
      0,
    );
    expect(stats.pagesScanned).toBe(2);
    expect(stats.source).toBe("sitemap");
    expect(stats.avgJsGatedFraction).toBeCloseTo(0.5, 5);
    expect(stats.avgTokensClaudePerProfile.headless).toBe(
      Math.round((Math.round(200 / 4) + Math.round(400 / 4)) / 2),
    );
  });

  it("handles empty page list without crashing", () => {
    const stats = computeSiteStats([], { source: "bfs", capped: false }, 0);
    expect(stats.pagesScanned).toBe(0);
    expect(stats.avgJsGatedFraction).toBe(0);
  });
});
