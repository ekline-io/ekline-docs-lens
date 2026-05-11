import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Runner } from "@/lib/core/runner";
import { registerProfile } from "@/lib/core/registry";
import type { ProfileResult, ProfileId } from "@/lib/core/types";
import type { RunEvent } from "@/lib/core/run-types";
import { rawHttpProfile } from "@/lib/profiles/rawHttp";
import { headlessProfile } from "@/lib/profiles/headless";
import { snippetProfile } from "@/lib/profiles/snippet";

// Mock the discover step to feed the runner a known list of pages without
// real network hits.
vi.mock("@/lib/crawl/discover", () => ({
  discoverPages: vi.fn(),
}));
import { discoverPages } from "@/lib/crawl/discover";

function fakeResult(id: ProfileId, chars: number): ProfileResult {
  return {
    id,
    ok: true,
    bytes: chars,
    chars,
    tokensClaude: Math.round(chars / 4),
    tokensGpt: Math.round(chars / 4),
    markdown: "x".repeat(chars),
    durationMs: 1,
  };
}

beforeEach(() => {
  vi.mocked(discoverPages).mockReset();
  registerProfile({
    id: "rawHttp",
    kind: "single-arg",
    fetch: async (ctx) => fakeResult("rawHttp", ctx.url.length * 5),
  });
  registerProfile({
    id: "headless",
    kind: "two-arg",
    fetch: async (ctx) => fakeResult("headless", ctx.url.length * 10),
  });
  registerProfile({
    id: "snippet",
    kind: "single-arg",
    fetch: async (ctx) => fakeResult("snippet", ctx.url.length * 2),
  });
});

afterEach(() => {
  registerProfile({ id: "rawHttp", kind: "single-arg", fetch: rawHttpProfile.fetch });
  registerProfile({ id: "headless", kind: "two-arg", fetch: headlessProfile.fetch });
  registerProfile({ id: "snippet", kind: "single-arg", fetch: snippetProfile.fetch });
});

describe("Runner.scanSite", () => {
  it("scans every discovered page and emits expected events", async () => {
    vi.mocked(discoverPages).mockResolvedValueOnce({
      pages: [
        "https://docs.example.com/api",
        "https://docs.example.com/api/charges",
        "https://docs.example.com/api/customers",
      ],
      source: "sitemap",
      capped: false,
    });
    const runner = new Runner({ browserMaxContexts: 2 });
    const events: RunEvent[] = [];
    try {
      const result = await runner.scanSite(
        { rootUrl: "https://docs.example.com/api", pageConcurrency: 2 },
        (e) => events.push(e),
      );
      expect(result.pages).toHaveLength(3);
      expect(result.pages.every((p) => Object.keys(p.profiles).length === 3)).toBe(true);
    } finally {
      await runner.close();
    }
    // Events: discover, then 3 page:start, then 9 profile:done (3 pages × 3),
    // then 3 page:done. Order between page:start and profile:done varies due
    // to concurrency.
    expect(events[0]).toEqual({
      type: "discover",
      pages: [
        "https://docs.example.com/api",
        "https://docs.example.com/api/charges",
        "https://docs.example.com/api/customers",
      ],
      source: "sitemap",
      capped: false,
    });
    const types = events.map((e) => e.type);
    expect(types.filter((t) => t === "page:start")).toHaveLength(3);
    expect(types.filter((t) => t === "profile:done")).toHaveLength(9);
    expect(types.filter((t) => t === "page:done")).toHaveLength(3);
  });

  it("respects pageConcurrency cap", async () => {
    vi.mocked(discoverPages).mockResolvedValueOnce({
      pages: Array.from(
        { length: 5 },
        (_, i) => `https://docs.example.com/api/p${i}`,
      ),
      source: "sitemap",
      capped: false,
    });
    const inFlight: number[] = [];
    let current = 0;
    const peak = { value: 0 };
    registerProfile({
      id: "rawHttp",
      kind: "single-arg",
      fetch: async (ctx) => {
        current += 1;
        peak.value = Math.max(peak.value, current);
        inFlight.push(current);
        await new Promise((r) => setTimeout(r, 10));
        current -= 1;
        return fakeResult("rawHttp", ctx.url.length);
      },
    });
    const runner = new Runner({ browserMaxContexts: 2 });
    try {
      await runner.scanSite(
        { rootUrl: "https://docs.example.com/api", pageConcurrency: 2 },
        () => {},
      );
    } finally {
      await runner.close();
    }
    // Concurrency cap is on PAGES, not profiles. With 3 profiles per page run
    // in parallel and pageConcurrency 2, the rawHttp slot should see at most
    // 2 in flight at once (one per concurrent page).
    expect(peak.value).toBeLessThanOrEqual(2);
  });
});
