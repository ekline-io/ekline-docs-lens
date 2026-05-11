import { describe, it, expect, vi, beforeEach } from "vitest";
import { runProfile, registerProfile, allProfiles } from "@/lib/core/registry";
import type { ProfileResult } from "@/lib/core/types";

vi.mock("undici", () => ({ request: vi.fn() }));
import { request } from "undici";
import fs from "node:fs";
import path from "node:path";

const fixture = fs.readFileSync(
  path.join(process.cwd(), "tests/fixtures/static-mdx.html"),
  "utf8"
);

beforeEach(() => {
  vi.mocked(request).mockReset();
  vi.mocked(request).mockResolvedValue({
    statusCode: 200,
    headers: {},
    body: { text: async () => fixture, dump: async () => {} },
  } as never);
});

describe("profile registry", () => {
  it("dispatches to single-arg profiles by id", async () => {
    const r = await runProfile("rawHttp", {
      url: "https://example.com",
      userAgent: "test",
      timeoutMs: 5000,
    });
    expect(r.id).toBe("rawHttp");
    expect(r.ok).toBe(true);
  });

  it("dispatches to two-arg profiles by id (deps required)", async () => {
    // We can't actually run headless without a BrowserPool, but we can
    // register a fake two-arg profile and verify the registry routes deps.
    const fake: ProfileResult = {
      id: "headless",
      ok: true,
      bytes: 1,
      chars: 1,
      tokensClaude: 1,
      tokensGpt: 1,
      markdown: "x",
      durationMs: 1,
    };
    let receivedDeps: unknown = null;
    registerProfile({
      id: "headless",
      kind: "two-arg",
      fetch: async (_ctx, deps) => {
        receivedDeps = deps;
        return fake;
      },
    });
    const r = await runProfile(
      "headless",
      { url: "x", userAgent: "u", timeoutMs: 1 },
      { pool: { sentinel: true } as never }
    );
    expect(r).toBe(fake);
    expect(receivedDeps).toEqual({ pool: { sentinel: true } });
  });

  it("allProfiles returns the built-in ids", () => {
    const ids = allProfiles().map((p) => p.id).sort();
    expect(ids).toEqual(["headless", "rawHttp", "snippet"]);
  });

  it("throws on unknown profile id", async () => {
    await expect(
      runProfile("nope" as never, {
        url: "x",
        userAgent: "u",
        timeoutMs: 1,
      })
    ).rejects.toThrow(/unknown profile/);
  });
});
