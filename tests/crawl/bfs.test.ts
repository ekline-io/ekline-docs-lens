import { describe, it, expect, vi, beforeEach } from "vitest";
import { bfsCrawl } from "@/lib/crawl/bfs";

vi.mock("undici", () => ({ request: vi.fn() }));
import { request } from "undici";

const pages: Record<string, string> = {
  "https://docs.example.com/api": `
    <html><body>
      <a href="/api/charges">Charges</a>
      <a href="/api/customers">Customers</a>
      <a href="/blog/post-1">Blog post (out of scope)</a>
      <a href="https://other.example.com/page">Off-host (out of scope)</a>
    </body></html>`,
  "https://docs.example.com/api/charges": `
    <html><body>
      <a href="/api/charges/create">Create</a>
      <a href="/api">Back</a>
    </body></html>`,
  "https://docs.example.com/api/customers": `
    <html><body><h1>Customers</h1></body></html>`,
  "https://docs.example.com/api/charges/create": `
    <html><body><h1>Create a charge</h1></body></html>`,
  "https://docs.example.com/blog/post-1": `<html><body>blog</body></html>`,
};

beforeEach(() => {
  vi.mocked(request).mockReset();
  vi.mocked(request).mockImplementation((async (url: unknown) => {
    const u = typeof url === "string" ? url : String(url);
    const body = pages[u] ?? "<html></html>";
    return {
      statusCode: 200,
      headers: {},
      body: { text: async () => body, dump: async () => {} },
    };
  }) as never);
});

describe("bfsCrawl", () => {
  it("stays within the seed's path prefix", async () => {
    const urls = await bfsCrawl("https://docs.example.com/api", { maxPages: 50 });
    expect(urls).toContain("https://docs.example.com/api");
    expect(urls).toContain("https://docs.example.com/api/charges");
    expect(urls).toContain("https://docs.example.com/api/customers");
    expect(urls).toContain("https://docs.example.com/api/charges/create");
    // Out of scope:
    expect(urls).not.toContain("https://docs.example.com/blog/post-1");
    expect(urls).not.toContain("https://other.example.com/page");
  });

  it("respects maxPages cap", async () => {
    const urls = await bfsCrawl("https://docs.example.com/api", { maxPages: 2 });
    expect(urls.length).toBe(2);
  });

  it("does not revisit URLs even when linked from multiple pages", async () => {
    const urls = await bfsCrawl("https://docs.example.com/api", { maxPages: 50 });
    const charges = urls.filter((u) => u === "https://docs.example.com/api/charges");
    expect(charges).toHaveLength(1);
  });
});
