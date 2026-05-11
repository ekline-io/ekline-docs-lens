import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchSitemap, parseSitemapXml } from "@/lib/crawl/sitemap";
import fs from "node:fs";
import path from "node:path";

vi.mock("undici", () => ({ request: vi.fn() }));
import { request } from "undici";

const flat = fs.readFileSync(
  path.join(process.cwd(), "tests/fixtures/sitemap-flat.xml"),
  "utf8",
);
const index = fs.readFileSync(
  path.join(process.cwd(), "tests/fixtures/sitemap-index.xml"),
  "utf8",
);

beforeEach(() => {
  vi.mocked(request).mockReset();
});

describe("parseSitemapXml", () => {
  it("returns urls + isIndex=false on a flat <urlset>", () => {
    const r = parseSitemapXml(flat);
    expect(r.isIndex).toBe(false);
    expect(r.urls).toEqual([
      "https://docs.example.com/",
      "https://docs.example.com/api",
      "https://docs.example.com/api/charges",
      "https://docs.example.com/api/customers",
    ]);
  });

  it("returns urls + isIndex=true on a <sitemapindex>", () => {
    const r = parseSitemapXml(index);
    expect(r.isIndex).toBe(true);
    expect(r.urls).toEqual([
      "https://docs.example.com/sitemap-api.xml",
      "https://docs.example.com/sitemap-guides.xml",
    ]);
  });

  it("returns empty list on malformed XML rather than throwing", () => {
    const r = parseSitemapXml("<<not xml");
    expect(r.urls).toEqual([]);
  });
});

describe("fetchSitemap", () => {
  it("recursively flattens a sitemap index", async () => {
    // Call 1: sitemap-index.xml → returns 2 child sitemap URLs
    // Call 2: sitemap-api.xml → returns the flat sitemap (4 URLs)
    // Call 3: sitemap-guides.xml → returns empty <urlset/>
    vi.mocked(request)
      .mockResolvedValueOnce({
        statusCode: 200,
        headers: {},
        body: { text: async () => index, dump: async () => {} },
      } as never)
      .mockResolvedValueOnce({
        statusCode: 200,
        headers: {},
        body: { text: async () => flat, dump: async () => {} },
      } as never)
      .mockResolvedValueOnce({
        statusCode: 200,
        headers: {},
        body: {
          text: async () =>
            `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>`,
          dump: async () => {},
        },
      } as never);
    const urls = await fetchSitemap("https://docs.example.com/sitemap.xml");
    expect(urls).toContain("https://docs.example.com/api");
    expect(urls).toContain("https://docs.example.com/api/charges");
    expect(urls).toHaveLength(4);
  });

  it("returns [] when sitemap fetch returns 404", async () => {
    vi.mocked(request).mockResolvedValueOnce({
      statusCode: 404,
      headers: {},
      body: { text: async () => "not found", dump: async () => {} },
    } as never);
    const urls = await fetchSitemap("https://docs.example.com/sitemap.xml");
    expect(urls).toEqual([]);
  });
});
