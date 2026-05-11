import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Runner } from "@/lib/core/runner";
import { registerProfile } from "@/lib/core/registry";
import type { ProfileResult, ProfileId } from "@/lib/core/types";
import { rawHttpProfile } from "@/lib/profiles/rawHttp";
import { headlessProfile } from "@/lib/profiles/headless";
import { snippetProfile } from "@/lib/profiles/snippet";

function fakeResult(id: ProfileId, chars: number, ok = true): ProfileResult {
  return {
    id,
    ok,
    reason: ok ? undefined : "stubbed failure",
    bytes: chars,
    chars,
    tokensClaude: Math.round(chars / 4),
    tokensGpt: Math.round(chars / 4),
    markdown: "x".repeat(chars),
    durationMs: 1,
  };
}

beforeEach(() => {
  // Replace built-in profiles with deterministic stubs that vary in size so
  // the runner's per-profile fan-out is observable.
  registerProfile({
    id: "rawHttp",
    kind: "single-arg",
    fetch: async () => fakeResult("rawHttp", 400),
  });
  registerProfile({
    id: "headless",
    kind: "two-arg",
    fetch: async () => fakeResult("headless", 1000),
  });
  registerProfile({
    id: "snippet",
    kind: "single-arg",
    fetch: async () => fakeResult("snippet", 150),
  });
});

afterEach(() => {
  // Restore real profiles for the rest of the suite.
  registerProfile({ id: "rawHttp", kind: "single-arg", fetch: rawHttpProfile.fetch });
  registerProfile({ id: "headless", kind: "two-arg", fetch: headlessProfile.fetch });
  registerProfile({ id: "snippet", kind: "single-arg", fetch: snippetProfile.fetch });
});

describe("Runner.scanPage", () => {
  it("runs all profiles for a single page and returns a PageResult", async () => {
    const runner = new Runner({ browserMaxContexts: 2 });
    try {
      const page = await runner.scanPage("https://example.com/foo");
      expect(page.url).toBe("https://example.com/foo");
      const ids = Object.keys(page.profiles).sort();
      expect(ids).toEqual(["headless", "rawHttp", "snippet"]);
      expect(page.profiles.headless.chars).toBe(1000);
      expect(page.profiles.rawHttp.chars).toBe(400);
      // summary mirrors profiles
      expect(page.summary.headless.chars).toBe(1000);
      expect(page.summary.headless.ok).toBe(true);
    } finally {
      await runner.close();
    }
  });

  it("does not crash if one profile throws — captures it as ok=false", async () => {
    registerProfile({
      id: "snippet",
      kind: "single-arg",
      fetch: async () => {
        throw new Error("simulated rate limit");
      },
    });
    const runner = new Runner({ browserMaxContexts: 2 });
    try {
      const page = await runner.scanPage("https://example.com/foo");
      expect(page.profiles.snippet.ok).toBe(false);
      expect(page.profiles.snippet.reason).toContain("simulated rate limit");
      // Other profiles still ran
      expect(page.profiles.rawHttp.ok).toBe(true);
    } finally {
      await runner.close();
    }
  });
});
