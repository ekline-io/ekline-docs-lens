import { describe, it, expect, vi, beforeEach } from "vitest";
import { discoverPages } from "@/lib/crawl/discover";

vi.mock("undici", () => ({ request: vi.fn() }));
import { request } from "undici";
import fs from "node:fs";
import path from "node:path";

const flat = fs.readFileSync(
  path.join(process.cwd(), "tests/fixtures/sitemap-flat.xml"),
  "utf8",
);

beforeEach(() => {
  vi.mocked(request).mockReset();
});

function mockSequence(seq: Array<{ status: number; body: string }>) {
  for (const r of seq) {
    vi.mocked(request).mockResolvedValueOnce({
      statusCode: r.status,
      headers: {},
      body: { text: async () => r.body, dump: async () => {} },
    } as never);
  }
}

describe("discoverPages", () => {
  it("uses sitemap when one exists, scoped to URL prefix", async () => {
    // First call: sitemap.xml (200 OK with flat sitemap covering /api/* + /)
    mockSequence([{ status: 200, body: flat }]);
    const r = await discoverPages("https://docs.example.com/api");
    expect(r.source).toBe("sitemap");
    expect(r.pages).toContain("https://docs.example.com/api");
    expect(r.pages).toContain("https://docs.example.com/api/charges");
    expect(r.pages).toContain("https://docs.example.com/api/customers");
    // The root "/" URL is in the sitemap but is NOT under /api prefix:
    expect(r.pages).not.toContain("https://docs.example.com/");
  });

  it("falls back to BFS when sitemap returns 404", async () => {
    // Call 1: sitemap.xml → 404
    // Call 2: BFS seed page → returns one internal link to /api/charges
    // Call 3: /api/charges page → returns no further links
    mockSequence([
      { status: 404, body: "" },
      {
        status: 200,
        body: `<html><body><a href="/api/charges">c</a></body></html>`,
      },
      { status: 200, body: `<html><body><h1>Charges</h1></body></html>` },
    ]);
    const r = await discoverPages("https://docs.example.com/api");
    expect(r.source).toBe("bfs");
    expect(r.pages).toContain("https://docs.example.com/api");
    expect(r.pages).toContain("https://docs.example.com/api/charges");
  });

  it("respects soft cap (default 10) and reports capped=true", async () => {
    // Build a 30-url sitemap.
    const lots = Array.from(
      { length: 30 },
      (_, i) => `<url><loc>https://docs.example.com/api/p${i}</loc></url>`,
    ).join("");
    const sitemap = `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${lots}</urlset>`;
    mockSequence([{ status: 200, body: sitemap }]);
    const r = await discoverPages("https://docs.example.com/api");
    expect(r.source).toBe("sitemap");
    expect(r.pages).toHaveLength(10);
    expect(r.capped).toBe(true);
  });

  it("honors a custom cap", async () => {
    const lots = Array.from(
      { length: 50 },
      (_, i) => `<url><loc>https://docs.example.com/api/p${i}</loc></url>`,
    ).join("");
    const sitemap = `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${lots}</urlset>`;
    mockSequence([{ status: 200, body: sitemap }]);
    const r = await discoverPages("https://docs.example.com/api", { cap: 10 });
    expect(r.pages).toHaveLength(10);
    expect(r.capped).toBe(true);
  });
});
