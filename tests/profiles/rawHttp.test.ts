import { describe, it, expect, vi, beforeEach } from "vitest";
import { rawHttpProfile } from "@/lib/profiles/rawHttp";
import { assertProfileShape } from "../core/profile-contract";

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
    headers: { "content-type": "text/html" },
    body: { text: async () => fixture, dump: async () => {} },
  } as never);
});

describe("rawHttp profile", () => {
  it("conforms to the Profile shape on a static page", async () => {
    const r = await rawHttpProfile.fetch({
      url: "https://example.com/charges",
      userAgent: "test",
      timeoutMs: 5_000,
    });
    assertProfileShape(r, "rawHttp");
    expect(r.ok).toBe(true);
    expect(r.markdown).toContain("Charges API");
    expect(r.markdown).toContain("```");
    expect(r.chars).toBeGreaterThan(0);
  });

  it("reports ok=false on network error", async () => {
    vi.mocked(request).mockRejectedValueOnce(new Error("ECONNRESET"));
    const r = await rawHttpProfile.fetch({
      url: "https://example.com",
      userAgent: "test",
      timeoutMs: 5_000,
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("ECONNRESET");
  });
});
