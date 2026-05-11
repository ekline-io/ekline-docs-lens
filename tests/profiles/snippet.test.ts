// tests/profiles/snippet.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { snippetProfile } from "@/lib/profiles/snippet";

vi.mock("undici", () => ({ request: vi.fn() }));

import { request } from "undici";

const SAMPLE_HTML = `
<!doctype html>
<html>
  <head>
    <title>Charges API · Stripe</title>
    <meta name="description" content="Create, retrieve, and refund charges." />
    <meta property="og:title" content="Charges API" />
    <meta property="og:description" content="Stripe Charges reference." />
    <meta property="og:image" content="https://stripe.com/og.png" />
    <meta name="twitter:card" content="summary_large_image" />
    <script type="application/ld+json">
      {"@context":"https://schema.org","@type":"TechArticle","headline":"Charges API"}
    </script>
  </head>
  <body>
    <h1>Charges API</h1>
    <p>The Charges resource lets you accept payments. This paragraph runs long enough to clearly exceed the snippet 200-char limit so we can verify truncation behavior end to end and not just the easy short-page case.</p>
  </body>
</html>
`;

beforeEach(() => {
  vi.mocked(request).mockReset();
});

describe("snippetProfile", () => {
  it("extracts title, description, og tags, first H1 and ~200 char preview", async () => {
    vi.mocked(request).mockResolvedValue({
      statusCode: 200,
      body: { text: async () => SAMPLE_HTML },
    } as never);

    const result = await snippetProfile.fetch({
      url: "https://example.com/charges",
      userAgent: "test",
      timeoutMs: 5000,
    });

    expect(result.id).toBe("snippet");
    expect(result.ok).toBe(true);
    expect(result.markdown).toContain("Charges API · Stripe");
    expect(result.markdown).toContain("Create, retrieve, and refund charges.");
    expect(result.markdown).toContain("og:title: Charges API");
    expect(result.markdown).toContain("og:image:");
    expect(result.markdown).toContain("First H1: Charges API");
    expect(result.markdown).toMatch(/Preview \(\d+ chars\):/);
  });

  it("returns ok=false on HTTP error", async () => {
    vi.mocked(request).mockResolvedValue({
      statusCode: 500,
      body: { text: async () => "" },
    } as never);

    const result = await snippetProfile.fetch({
      url: "https://example.com/x",
      userAgent: "test",
      timeoutMs: 5000,
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toContain("HTTP 500");
  });

  it("returns ok=true with empty markdown on a metadata-less page", async () => {
    vi.mocked(request).mockResolvedValue({
      statusCode: 200,
      body: { text: async () => "<html><body><p>just text</p></body></html>" },
    } as never);

    const result = await snippetProfile.fetch({
      url: "https://example.com/bare",
      userAgent: "test",
      timeoutMs: 5000,
    });

    expect(result.ok).toBe(true);
    expect(result.markdown).toContain("Preview");
    expect(result.markdown).toContain("just text");
  });
});
