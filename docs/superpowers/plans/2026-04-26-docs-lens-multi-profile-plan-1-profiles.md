# Docs Lens Multi-Profile — Plan 1: Profile Engine

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a deterministic, testable engine that takes a single URL and returns six independent reader profiles' views of that URL — without any UI, crawler, or prose layer yet.

**Architecture:** A `Profile` interface with six implementations under `src/lib/profiles/`. Cheap profiles (raw HTTP, structured data, Jina, Readability) use one-off `undici` requests; the two browser-based profiles (`headless`, `axTree`) share a pooled Playwright Chromium instance via a `BrowserPool`. A thin `/api/profile` route exposes the engine for end-to-end smoke testing before the larger run orchestrator lands.

**Tech Stack:** TypeScript, Next.js 16 App Router, undici, cheerio, jsdom, @mozilla/readability, Playwright, @anthropic-ai/tokenizer, tiktoken, Vitest for tests.

**Spec:** [docs/superpowers/specs/2026-04-26-docs-lens-multi-profile-design.md](../specs/2026-04-26-docs-lens-multi-profile-design.md), sections 4, 5, and 11.

---

## Conventions used in this plan

- Test framework is Vitest. Run a single test with `npx vitest run path/to/test.ts -t "test name"`.
- All paths are relative to `docs-lens-next/`.
- Each task ends with a commit. Use the suggested commit message verbatim or a close variant.
- After each commit, run `npm run lint && npx tsc --noEmit` to catch regressions; if either fails, fix before moving on.
- Tasks 11–12 require Chromium installed (`npx playwright install chromium`). Tasks 1–10 do not.

---

## Task 1: Scaffold module tree, install deps, set up Vitest

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Create: `tests/smoke.test.ts`
- Create empty placeholder dirs by adding `.gitkeep` files: `src/lib/core/`, `src/lib/profiles/`, `src/lib/tokenizer/`, `tests/fixtures/`

- [ ] **Step 1: Install runtime + dev dependencies**

```bash
npm install @mozilla/readability jsdom @anthropic-ai/tokenizer tiktoken playwright fast-xml-parser
npm install -D vitest @vitest/coverage-v8 @types/jsdom
```

- [ ] **Step 2: Add test scripts to `package.json`**

Open `package.json`, replace the `"scripts"` block with:

```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "eslint",
  "test": "vitest run",
  "test:watch": "vitest",
  "test:coverage": "vitest run --coverage",
  "test:browser": "vitest run tests/browser",
  "playwright:install": "playwright install chromium"
}
```

- [ ] **Step 3: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    exclude: ["tests/browser/**"],
    coverage: { reporter: ["text", "html"], include: ["src/lib/**"] },
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
});
```

- [ ] **Step 4: Create empty module dirs**

```bash
mkdir -p src/lib/core src/lib/profiles src/lib/tokenizer tests/fixtures tests/browser
touch src/lib/core/.gitkeep src/lib/profiles/.gitkeep src/lib/tokenizer/.gitkeep tests/fixtures/.gitkeep tests/browser/.gitkeep
```

- [ ] **Step 5: Write the smoke test**

Create `tests/smoke.test.ts`:

```ts
import { describe, it, expect } from "vitest";

describe("smoke", () => {
  it("vitest works", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 6: Run smoke test**

```bash
npm test
```

Expected: 1 passing test.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json vitest.config.ts tests/smoke.test.ts src/lib/core/.gitkeep src/lib/profiles/.gitkeep src/lib/tokenizer/.gitkeep tests/fixtures/.gitkeep tests/browser/.gitkeep
git commit -m "chore: scaffold profile engine module tree + vitest"
```

---

## Task 2: Define core types

**Files:**
- Create: `src/lib/core/types.ts`
- Create: `tests/core/types.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/core/types.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  PROFILE_IDS,
  isProfileId,
  type ProfileResult,
} from "@/lib/core/types";

describe("core types", () => {
  it("declares all six profile ids", () => {
    expect(PROFILE_IDS).toEqual([
      "rawHttp",
      "readability",
      "headless",
      "axTree",
      "structured",
      "jina",
    ]);
  });

  it("isProfileId narrows correctly", () => {
    expect(isProfileId("rawHttp")).toBe(true);
    expect(isProfileId("nope")).toBe(false);
  });

  it("ProfileResult.ok=false carries a reason", () => {
    const r: ProfileResult = {
      id: "jina",
      ok: false,
      reason: "rate limited",
      bytes: 0,
      chars: 0,
      tokensClaude: 0,
      tokensGpt: 0,
      markdown: "",
      durationMs: 0,
    };
    expect(r.reason).toBe("rate limited");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/core/types.test.ts
```

Expected: FAIL with cannot resolve module `@/lib/core/types`.

- [ ] **Step 3: Implement `src/lib/core/types.ts`**

```ts
export const PROFILE_IDS = [
  "rawHttp",
  "readability",
  "headless",
  "axTree",
  "structured",
  "jina",
] as const;

export type ProfileId = (typeof PROFILE_IDS)[number];

export function isProfileId(x: unknown): x is ProfileId {
  return typeof x === "string" && (PROFILE_IDS as readonly string[]).includes(x);
}

export interface ProfileResult {
  id: ProfileId;
  ok: boolean;
  reason?: string;
  bytes: number;
  chars: number;
  tokensClaude: number;
  tokensGpt: number;
  markdown: string;
  rawArtifact?: string;
  durationMs: number;
}

export interface FetchContext {
  url: string;
  userAgent: string;
  timeoutMs: number;
  signal?: AbortSignal;
}

export const DEFAULT_FETCH_CONTEXT = {
  userAgent:
    "docs-lens/0.2 (+https://ekline.io; deterministic docs scanner)",
  timeoutMs: 20_000,
};
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/core/types.test.ts
```

Expected: 3 passing tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/core/types.ts tests/core/types.test.ts
git commit -m "feat(core): define ProfileId, ProfileResult, FetchContext"
```

---

## Task 3: Profile interface + a fixture-driven contract test

**Files:**
- Create: `src/lib/core/profile.ts`
- Create: `tests/fixtures/static-mdx.html`
- Create: `tests/core/profile-contract.ts` (helper, not a test file itself)

- [ ] **Step 1: Add a small captured HTML fixture**

Create `tests/fixtures/static-mdx.html`:

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <title>Charges API · Stripe</title>
    <meta name="description" content="Create and manage charges." />
    <script type="application/ld+json">
      { "@context": "https://schema.org", "@type": "TechArticle",
        "headline": "Charges API" }
    </script>
  </head>
  <body>
    <main>
      <h1>Charges API</h1>
      <p>Create a charge with a single POST request.</p>
      <pre><code class="language-bash">curl https://api.stripe.com/v1/charges</code></pre>
      <table><tr><th>Field</th><th>Type</th></tr><tr><td>id</td><td>string</td></tr></table>
    </main>
  </body>
</html>
```

- [ ] **Step 2: Write the contract test helper**

Create `tests/core/profile-contract.ts`:

```ts
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
```

- [ ] **Step 3: Implement `src/lib/core/profile.ts`**

```ts
import type { FetchContext, ProfileId, ProfileResult } from "./types";

export interface Profile {
  readonly id: ProfileId;
  fetch(ctx: FetchContext): Promise<ProfileResult>;
}

export function emptyResult(id: ProfileId, reason: string, durationMs: number): ProfileResult {
  return {
    id,
    ok: false,
    reason,
    bytes: 0,
    chars: 0,
    tokensClaude: 0,
    tokensGpt: 0,
    markdown: "",
    durationMs,
  };
}
```

- [ ] **Step 4: Run lint + typecheck to confirm everything compiles**

```bash
npm run lint && npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/core/profile.ts tests/fixtures/static-mdx.html tests/core/profile-contract.ts
git commit -m "feat(core): Profile interface + emptyResult helper + first fixture"
```

---

## Task 4: Tokenizer wrapper

**Files:**
- Create: `src/lib/tokenizer/count.ts`
- Create: `tests/tokenizer/count.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/tokenizer/count.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { countTokens } from "@/lib/tokenizer/count";

describe("countTokens", () => {
  it("returns zero for empty string", () => {
    expect(countTokens("")).toEqual({ claude: 0, gpt: 0 });
  });

  it("returns positive counts for prose", () => {
    const { claude, gpt } = countTokens(
      "Charges API. Create a charge with a single POST request."
    );
    expect(claude).toBeGreaterThan(5);
    expect(gpt).toBeGreaterThan(5);
  });

  it("Claude and GPT counts differ", () => {
    // tokenizers diverge enough that a 200-char string should not produce
    // identical counts. If it does we likely shipped one tokenizer twice.
    const sample = "The quick brown fox jumps over the lazy dog. ".repeat(8);
    const { claude, gpt } = countTokens(sample);
    expect(claude).not.toBe(gpt);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/tokenizer/count.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/tokenizer/count.ts`**

```ts
import { countTokens as anthropicCount } from "@anthropic-ai/tokenizer";
import { encoding_for_model } from "tiktoken";

const gptEncoder = encoding_for_model("gpt-4o");

export interface TokenCounts {
  claude: number;
  gpt: number;
}

export function countTokens(text: string): TokenCounts {
  if (!text) return { claude: 0, gpt: 0 };
  return {
    claude: anthropicCount(text),
    gpt: gptEncoder.encode(text).length,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/tokenizer/count.test.ts
```

Expected: 3 passing tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/tokenizer/count.ts tests/tokenizer/count.test.ts
git commit -m "feat(tokenizer): add Claude + GPT deterministic token counter"
```

---

## Task 5: rawHttp profile (extract existing behavior)

**Files:**
- Create: `src/lib/profiles/rawHttp.ts`
- Create: `tests/profiles/rawHttp.test.ts`
- Reference: `src/lib/fetch.ts`, `src/lib/convert.ts` (existing)

- [ ] **Step 1: Write the failing test**

Create `tests/profiles/rawHttp.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { rawHttpProfile } from "@/lib/profiles/rawHttp";
import { assertProfileShape } from "../core/profile-contract";

vi.mock("undici", () => ({
  request: vi.fn(),
}));

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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/profiles/rawHttp.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/profiles/rawHttp.ts`**

```ts
import { request } from "undici";
import { htmlToMarkdown } from "@/lib/convert";
import { emptyResult, type Profile } from "@/lib/core/profile";
import type { FetchContext, ProfileResult } from "@/lib/core/types";
import { countTokens } from "@/lib/tokenizer/count";

async function doFetch(ctx: FetchContext): Promise<ProfileResult> {
  const start = Date.now();
  try {
    const res = await request(ctx.url, {
      method: "GET",
      headers: {
        "user-agent": ctx.userAgent,
        accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
      },
      bodyTimeout: ctx.timeoutMs,
      headersTimeout: ctx.timeoutMs,
      signal: ctx.signal,
    } as Parameters<typeof request>[1]);
    const body = await res.body.text();
    const markdown = htmlToMarkdown(body);
    const { claude, gpt } = countTokens(markdown);
    return {
      id: "rawHttp",
      ok: res.statusCode >= 200 && res.statusCode < 400,
      reason: res.statusCode >= 400 ? `HTTP ${res.statusCode}` : undefined,
      bytes: Buffer.byteLength(body, "utf8"),
      chars: markdown.length,
      tokensClaude: claude,
      tokensGpt: gpt,
      markdown,
      rawArtifact: body,
      durationMs: Date.now() - start,
    };
  } catch (e) {
    return emptyResult(
      "rawHttp",
      e instanceof Error ? e.message : "fetch failed",
      Date.now() - start
    );
  }
}

export const rawHttpProfile: Profile = {
  id: "rawHttp",
  fetch: doFetch,
};
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/profiles/rawHttp.test.ts
```

Expected: 2 passing tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/profiles/rawHttp.ts tests/profiles/rawHttp.test.ts
git commit -m "feat(profiles): rawHttp profile (Turndown pipeline behind Profile interface)"
```

---

## Task 6: structured profile (JSON-LD + OG + schema.org)

**Files:**
- Create: `src/lib/profiles/structured.ts`
- Create: `tests/profiles/structured.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/profiles/structured.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { structuredProfile } from "@/lib/profiles/structured";
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

describe("structured profile", () => {
  it("extracts JSON-LD as markdown bullets", async () => {
    const r = await structuredProfile.fetch({
      url: "https://example.com",
      userAgent: "test",
      timeoutMs: 5_000,
    });
    assertProfileShape(r, "structured");
    expect(r.ok).toBe(true);
    expect(r.markdown).toContain("TechArticle");
    expect(r.markdown).toContain("Charges API");
  });

  it("ok=true with empty markdown when no structured data present", async () => {
    vi.mocked(request).mockResolvedValueOnce({
      statusCode: 200,
      headers: {},
      body: { text: async () => "<html><body>no metadata</body></html>", dump: async () => {} },
    } as never);
    const r = await structuredProfile.fetch({
      url: "https://example.com",
      userAgent: "test",
      timeoutMs: 5_000,
    });
    expect(r.ok).toBe(true);
    expect(r.markdown).toBe("");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/profiles/structured.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/profiles/structured.ts`**

```ts
import { request } from "undici";
import * as cheerio from "cheerio";
import { emptyResult, type Profile } from "@/lib/core/profile";
import type { FetchContext, ProfileResult } from "@/lib/core/types";
import { countTokens } from "@/lib/tokenizer/count";

interface Extracted {
  jsonLd: unknown[];
  openGraph: Record<string, string>;
  meta: Record<string, string>;
}

function extract(html: string): Extracted {
  const $ = cheerio.load(html);
  const jsonLd: unknown[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).contents().text();
    try {
      jsonLd.push(JSON.parse(raw));
    } catch {
      // malformed JSON-LD is a finding for later, not a fetch failure
    }
  });
  const openGraph: Record<string, string> = {};
  $('meta[property^="og:"]').each((_, el) => {
    const k = $(el).attr("property");
    const v = $(el).attr("content");
    if (k && v) openGraph[k] = v;
  });
  const meta: Record<string, string> = {};
  $('meta[name]').each((_, el) => {
    const k = $(el).attr("name");
    const v = $(el).attr("content");
    if (k && v) meta[k] = v;
  });
  return { jsonLd, openGraph, meta };
}

function toMarkdown(e: Extracted): string {
  const lines: string[] = [];
  if (e.jsonLd.length) {
    lines.push("## JSON-LD");
    for (const item of e.jsonLd) {
      lines.push("```json");
      lines.push(JSON.stringify(item, null, 2));
      lines.push("```");
    }
  }
  if (Object.keys(e.openGraph).length) {
    lines.push("## OpenGraph");
    for (const [k, v] of Object.entries(e.openGraph)) lines.push(`- ${k}: ${v}`);
  }
  if (Object.keys(e.meta).length) {
    lines.push("## Meta");
    for (const [k, v] of Object.entries(e.meta)) lines.push(`- ${k}: ${v}`);
  }
  return lines.join("\n");
}

export const structuredProfile: Profile = {
  id: "structured",
  async fetch(ctx: FetchContext): Promise<ProfileResult> {
    const start = Date.now();
    try {
      const res = await request(ctx.url, {
        method: "GET",
        headers: { "user-agent": ctx.userAgent },
        bodyTimeout: ctx.timeoutMs,
        headersTimeout: ctx.timeoutMs,
        signal: ctx.signal,
      } as Parameters<typeof request>[1]);
      const body = await res.body.text();
      const extracted = extract(body);
      const markdown = toMarkdown(extracted);
      const { claude, gpt } = countTokens(markdown);
      return {
        id: "structured",
        ok: res.statusCode >= 200 && res.statusCode < 400,
        reason: res.statusCode >= 400 ? `HTTP ${res.statusCode}` : undefined,
        bytes: Buffer.byteLength(markdown, "utf8"),
        chars: markdown.length,
        tokensClaude: claude,
        tokensGpt: gpt,
        markdown,
        rawArtifact: JSON.stringify(extracted),
        durationMs: Date.now() - start,
      };
    } catch (e) {
      return emptyResult(
        "structured",
        e instanceof Error ? e.message : "fetch failed",
        Date.now() - start
      );
    }
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/profiles/structured.test.ts
```

Expected: 2 passing tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/profiles/structured.ts tests/profiles/structured.test.ts
git commit -m "feat(profiles): structured-data profile (JSON-LD + OG + meta)"
```

---

## Task 7: Jina passthrough profile

**Files:**
- Create: `src/lib/profiles/jina.ts`
- Create: `tests/profiles/jina.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/profiles/jina.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { jinaProfile } from "@/lib/profiles/jina";
import { assertProfileShape } from "../core/profile-contract";

vi.mock("undici", () => ({ request: vi.fn() }));
import { request } from "undici";

beforeEach(() => {
  vi.mocked(request).mockReset();
});

describe("jina profile", () => {
  it("hits r.jina.ai with the original URL", async () => {
    vi.mocked(request).mockResolvedValueOnce({
      statusCode: 200,
      headers: { "content-type": "text/markdown" },
      body: {
        text: async () => "# Charges API\n\nCreate a charge.",
        dump: async () => {},
      },
    } as never);
    const r = await jinaProfile.fetch({
      url: "https://example.com/charges",
      userAgent: "test",
      timeoutMs: 10_000,
    });
    assertProfileShape(r, "jina");
    expect(r.ok).toBe(true);
    expect(r.markdown).toContain("Charges API");
    expect(vi.mocked(request).mock.calls[0]?.[0]).toBe(
      "https://r.jina.ai/https://example.com/charges"
    );
  });

  it("reports ok=false on 429 rate limit", async () => {
    vi.mocked(request).mockResolvedValueOnce({
      statusCode: 429,
      headers: {},
      body: { text: async () => "rate limited", dump: async () => {} },
    } as never);
    const r = await jinaProfile.fetch({
      url: "https://example.com",
      userAgent: "test",
      timeoutMs: 10_000,
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("429");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/profiles/jina.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/profiles/jina.ts`**

```ts
import { request } from "undici";
import { emptyResult, type Profile } from "@/lib/core/profile";
import type { FetchContext, ProfileResult } from "@/lib/core/types";
import { countTokens } from "@/lib/tokenizer/count";

const JINA_BASE = "https://r.jina.ai/";

export const jinaProfile: Profile = {
  id: "jina",
  async fetch(ctx: FetchContext): Promise<ProfileResult> {
    const start = Date.now();
    try {
      const target = JINA_BASE + ctx.url;
      const res = await request(target, {
        method: "GET",
        headers: {
          "user-agent": ctx.userAgent,
          accept: "text/markdown,text/plain;q=0.9",
        },
        bodyTimeout: ctx.timeoutMs,
        headersTimeout: ctx.timeoutMs,
        signal: ctx.signal,
      } as Parameters<typeof request>[1]);
      const body = await res.body.text();
      if (res.statusCode < 200 || res.statusCode >= 400) {
        return emptyResult(
          "jina",
          `HTTP ${res.statusCode}`,
          Date.now() - start
        );
      }
      const { claude, gpt } = countTokens(body);
      return {
        id: "jina",
        ok: true,
        bytes: Buffer.byteLength(body, "utf8"),
        chars: body.length,
        tokensClaude: claude,
        tokensGpt: gpt,
        markdown: body,
        rawArtifact: body,
        durationMs: Date.now() - start,
      };
    } catch (e) {
      return emptyResult(
        "jina",
        e instanceof Error ? e.message : "fetch failed",
        Date.now() - start
      );
    }
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/profiles/jina.test.ts
```

Expected: 2 passing tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/profiles/jina.ts tests/profiles/jina.test.ts
git commit -m "feat(profiles): jina passthrough profile (real ground-truth anchor)"
```

---

## Task 8: Readability profile

**Files:**
- Create: `src/lib/profiles/readability.ts`
- Create: `tests/profiles/readability.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/profiles/readability.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readabilityProfile } from "@/lib/profiles/readability";
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

describe("readability profile", () => {
  it("extracts the article body", async () => {
    const r = await readabilityProfile.fetch({
      url: "https://example.com/charges",
      userAgent: "test",
      timeoutMs: 5_000,
    });
    assertProfileShape(r, "readability");
    expect(r.ok).toBe(true);
    expect(r.markdown).toContain("Charges API");
    expect(r.markdown).toContain("Create a charge");
  });

  it("ok=false with reason 'no article' on a page Readability cannot parse", async () => {
    vi.mocked(request).mockResolvedValueOnce({
      statusCode: 200,
      headers: {},
      body: { text: async () => "<html><body><div>x</div></body></html>", dump: async () => {} },
    } as never);
    const r = await readabilityProfile.fetch({
      url: "https://example.com",
      userAgent: "test",
      timeoutMs: 5_000,
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/no article|empty/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/profiles/readability.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/profiles/readability.ts`**

```ts
import { request } from "undici";
import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import TurndownService from "turndown";
import { emptyResult, type Profile } from "@/lib/core/profile";
import type { FetchContext, ProfileResult } from "@/lib/core/types";
import { countTokens } from "@/lib/tokenizer/count";

const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  bulletListMarker: "-",
});

export const readabilityProfile: Profile = {
  id: "readability",
  async fetch(ctx: FetchContext): Promise<ProfileResult> {
    const start = Date.now();
    try {
      const res = await request(ctx.url, {
        method: "GET",
        headers: { "user-agent": ctx.userAgent },
        bodyTimeout: ctx.timeoutMs,
        headersTimeout: ctx.timeoutMs,
        signal: ctx.signal,
      } as Parameters<typeof request>[1]);
      const html = await res.body.text();
      if (res.statusCode < 200 || res.statusCode >= 400) {
        return emptyResult("readability", `HTTP ${res.statusCode}`, Date.now() - start);
      }
      const dom = new JSDOM(html, { url: ctx.url });
      const reader = new Readability(dom.window.document);
      const article = reader.parse();
      if (!article || !article.content || !article.content.trim()) {
        return emptyResult("readability", "no article extracted", Date.now() - start);
      }
      const markdown = turndown.turndown(article.content);
      const { claude, gpt } = countTokens(markdown);
      return {
        id: "readability",
        ok: true,
        bytes: Buffer.byteLength(markdown, "utf8"),
        chars: markdown.length,
        tokensClaude: claude,
        tokensGpt: gpt,
        markdown,
        rawArtifact: article.content,
        durationMs: Date.now() - start,
      };
    } catch (e) {
      return emptyResult(
        "readability",
        e instanceof Error ? e.message : "fetch failed",
        Date.now() - start
      );
    }
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/profiles/readability.test.ts
```

Expected: 2 passing tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/profiles/readability.ts tests/profiles/readability.test.ts
git commit -m "feat(profiles): readability profile (jsdom + @mozilla/readability)"
```

---

## Task 9: BrowserPool

**Files:**
- Create: `src/lib/core/browser-pool.ts`
- Create: `tests/browser/browser-pool.test.ts`

- [ ] **Step 0: Install Chromium for Playwright (one-time)**

```bash
npm run playwright:install
```

This downloads ~170 MB. If you've already done it, skip.

- [ ] **Step 1: Write the failing test**

Create `tests/browser/browser-pool.test.ts`:

```ts
import { describe, it, expect, afterAll } from "vitest";
import { BrowserPool } from "@/lib/core/browser-pool";

const pool = new BrowserPool({ maxContexts: 2 });

afterAll(async () => {
  await pool.close();
});

describe("BrowserPool", () => {
  it("hands out a context and returns it on release", async () => {
    const ctx = await pool.acquire();
    expect(ctx).toBeDefined();
    await pool.release(ctx);
  });

  it("blocks acquire beyond maxContexts until release", async () => {
    const a = await pool.acquire();
    const b = await pool.acquire();
    let resolvedThird = false;
    const cPromise = pool.acquire().then(() => {
      resolvedThird = true;
    });
    await new Promise((r) => setTimeout(r, 50));
    expect(resolvedThird).toBe(false);
    await pool.release(a);
    await cPromise;
    expect(resolvedThird).toBe(true);
    await pool.release(b);
    // c was acquired and never released; clean up
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run test:browser
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/core/browser-pool.ts`**

```ts
import { chromium, type Browser, type BrowserContext } from "playwright";

export interface BrowserPoolOptions {
  maxContexts: number;
  userAgent?: string;
}

export class BrowserPool {
  private browser: Browser | null = null;
  private inUse = 0;
  private waiters: Array<() => void> = [];

  constructor(private opts: BrowserPoolOptions) {}

  private async ensureBrowser(): Promise<Browser> {
    if (!this.browser) {
      this.browser = await chromium.launch({ headless: true });
    }
    return this.browser;
  }

  async acquire(): Promise<BrowserContext> {
    if (this.inUse >= this.opts.maxContexts) {
      await new Promise<void>((resolve) => this.waiters.push(resolve));
    }
    this.inUse += 1;
    const browser = await this.ensureBrowser();
    return browser.newContext({
      userAgent: this.opts.userAgent,
      bypassCSP: true,
    });
  }

  async release(ctx: BrowserContext): Promise<void> {
    await ctx.close();
    this.inUse -= 1;
    const next = this.waiters.shift();
    if (next) next();
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm run test:browser
```

Expected: 2 passing tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/core/browser-pool.ts tests/browser/browser-pool.test.ts
git commit -m "feat(core): BrowserPool with bounded context concurrency"
```

---

## Task 10: Headless profile

**Files:**
- Create: `src/lib/profiles/headless.ts`
- Create: `tests/browser/headless.test.ts`
- Create: `tests/fixtures/spa.html` (static fixture served via local file:// URL)

- [ ] **Step 1: Add a JS-rendered fixture**

Create `tests/fixtures/spa.html`:

```html
<!DOCTYPE html>
<html>
  <head><title>SPA fixture</title></head>
  <body>
    <div id="root">loading...</div>
    <script>
      document.getElementById("root").innerHTML =
        '<main><h1>SPA Charges</h1><p>Hydrated content visible only after JS.</p></main>';
    </script>
  </body>
</html>
```

- [ ] **Step 2: Write the failing test**

Create `tests/browser/headless.test.ts`:

```ts
import { describe, it, expect, afterAll } from "vitest";
import path from "node:path";
import { headlessProfile } from "@/lib/profiles/headless";
import { BrowserPool } from "@/lib/core/browser-pool";
import { assertProfileShape } from "../core/profile-contract";

const pool = new BrowserPool({ maxContexts: 2, userAgent: "docs-lens-test" });
afterAll(() => pool.close());

const fileUrl =
  "file://" + path.resolve(process.cwd(), "tests/fixtures/spa.html");

describe("headless profile", () => {
  it("captures post-JS DOM content", async () => {
    const r = await headlessProfile.fetch(
      { url: fileUrl, userAgent: "docs-lens-test", timeoutMs: 15_000 },
      { pool }
    );
    assertProfileShape(r, "headless");
    expect(r.ok).toBe(true);
    expect(r.markdown).toContain("SPA Charges");
    expect(r.markdown).toContain("Hydrated content");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
npm run test:browser
```

Expected: FAIL — module not found.

- [ ] **Step 4: Implement `src/lib/profiles/headless.ts`**

```ts
import TurndownService from "turndown";
import { emptyResult, type Profile } from "@/lib/core/profile";
import type { FetchContext, ProfileResult } from "@/lib/core/types";
import type { BrowserPool } from "@/lib/core/browser-pool";
import { countTokens } from "@/lib/tokenizer/count";

const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  bulletListMarker: "-",
});

export interface BrowserCtx {
  pool: BrowserPool;
}

async function doFetch(ctx: FetchContext, deps: BrowserCtx): Promise<ProfileResult> {
  const start = Date.now();
  const browserCtx = await deps.pool.acquire();
  try {
    const page = await browserCtx.newPage();
    const response = await page.goto(ctx.url, {
      waitUntil: "networkidle",
      timeout: ctx.timeoutMs,
    });
    const status = response?.status() ?? 0;
    if (status && (status < 200 || status >= 400)) {
      return emptyResult("headless", `HTTP ${status}`, Date.now() - start);
    }
    const html = await page.content();
    const markdown = turndown.turndown(html);
    const { claude, gpt } = countTokens(markdown);
    return {
      id: "headless",
      ok: true,
      bytes: Buffer.byteLength(html, "utf8"),
      chars: markdown.length,
      tokensClaude: claude,
      tokensGpt: gpt,
      markdown,
      rawArtifact: html,
      durationMs: Date.now() - start,
    };
  } catch (e) {
    return emptyResult(
      "headless",
      e instanceof Error ? e.message : "headless fetch failed",
      Date.now() - start
    );
  } finally {
    await deps.pool.release(browserCtx);
  }
}

export const headlessProfile: Profile & {
  fetch: (ctx: FetchContext, deps: BrowserCtx) => Promise<ProfileResult>;
} = {
  id: "headless",
  fetch: doFetch,
};
```

- [ ] **Step 5: Run test to verify it passes**

```bash
npm run test:browser
```

Expected: 1 passing test (in addition to BrowserPool's 2).

- [ ] **Step 6: Commit**

```bash
git add src/lib/profiles/headless.ts tests/browser/headless.test.ts tests/fixtures/spa.html
git commit -m "feat(profiles): headless profile (Playwright post-JS DOM)"
```

---

## Task 11: Accessibility-tree profile

**Files:**
- Create: `src/lib/profiles/axTree.ts`
- Create: `tests/browser/axTree.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/browser/axTree.test.ts`:

```ts
import { describe, it, expect, afterAll } from "vitest";
import path from "node:path";
import { axTreeProfile } from "@/lib/profiles/axTree";
import { BrowserPool } from "@/lib/core/browser-pool";
import { assertProfileShape } from "../core/profile-contract";

const pool = new BrowserPool({ maxContexts: 2, userAgent: "docs-lens-test" });
afterAll(() => pool.close());

const fileUrl =
  "file://" + path.resolve(process.cwd(), "tests/fixtures/spa.html");

describe("axTree profile", () => {
  it("flattens accessibility tree to a markdown outline", async () => {
    const r = await axTreeProfile.fetch(
      { url: fileUrl, userAgent: "docs-lens-test", timeoutMs: 15_000 },
      { pool }
    );
    assertProfileShape(r, "axTree");
    expect(r.ok).toBe(true);
    // Heading appears in the a11y tree even though its level is in a role attr
    expect(r.markdown.toLowerCase()).toContain("spa charges");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run test:browser
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/profiles/axTree.ts`**

```ts
import { emptyResult, type Profile } from "@/lib/core/profile";
import type { FetchContext, ProfileResult } from "@/lib/core/types";
import type { BrowserPool } from "@/lib/core/browser-pool";
import { countTokens } from "@/lib/tokenizer/count";

interface AxNode {
  role?: string;
  name?: string;
  value?: string;
  children?: AxNode[];
}

function flatten(node: AxNode, depth = 0, out: string[] = []): string[] {
  const indent = "  ".repeat(depth);
  const role = node.role ?? "";
  const name = (node.name ?? "").trim();
  const value = (node.value ?? "").trim();
  if (role || name) {
    const label = [role, name && `"${name}"`, value && `= ${value}`]
      .filter(Boolean)
      .join(" ");
    out.push(`${indent}- ${label}`);
  }
  for (const child of node.children ?? []) flatten(child, depth + 1, out);
  return out;
}

interface BrowserCtx {
  pool: BrowserPool;
}

async function doFetch(ctx: FetchContext, deps: BrowserCtx): Promise<ProfileResult> {
  const start = Date.now();
  const browserCtx = await deps.pool.acquire();
  try {
    const page = await browserCtx.newPage();
    const response = await page.goto(ctx.url, {
      waitUntil: "networkidle",
      timeout: ctx.timeoutMs,
    });
    const status = response?.status() ?? 0;
    if (status && (status < 200 || status >= 400)) {
      return emptyResult("axTree", `HTTP ${status}`, Date.now() - start);
    }
    const snapshot = (await page.accessibility.snapshot({
      interestingOnly: false,
    })) as AxNode | null;
    if (!snapshot) {
      return emptyResult("axTree", "no a11y snapshot", Date.now() - start);
    }
    const lines = flatten(snapshot);
    const markdown = lines.join("\n");
    const { claude, gpt } = countTokens(markdown);
    return {
      id: "axTree",
      ok: true,
      bytes: Buffer.byteLength(markdown, "utf8"),
      chars: markdown.length,
      tokensClaude: claude,
      tokensGpt: gpt,
      markdown,
      rawArtifact: JSON.stringify(snapshot),
      durationMs: Date.now() - start,
    };
  } catch (e) {
    return emptyResult(
      "axTree",
      e instanceof Error ? e.message : "axTree fetch failed",
      Date.now() - start
    );
  } finally {
    await deps.pool.release(browserCtx);
  }
}

export const axTreeProfile: Profile & {
  fetch: (ctx: FetchContext, deps: BrowserCtx) => Promise<ProfileResult>;
} = {
  id: "axTree",
  fetch: doFetch,
};
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm run test:browser
```

Expected: 1 passing test (plus the 2 from BrowserPool and 1 from headless).

- [ ] **Step 5: Commit**

```bash
git add src/lib/profiles/axTree.ts tests/browser/axTree.test.ts
git commit -m "feat(profiles): axTree profile (Playwright a11y snapshot flattened)"
```

---

## Task 12: Smoke API route — `/api/profile`

**Files:**
- Create: `src/app/api/profile/route.ts`
- Create: `tests/api/profile.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/api/profile.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("undici", () => ({ request: vi.fn() }));
import { request } from "undici";
import fs from "node:fs";
import path from "node:path";
import { GET } from "@/app/api/profile/route";

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

function mkReq(url: string, profile: string) {
  return new Request(
    `http://localhost/api/profile?url=${encodeURIComponent(url)}&profile=${profile}`
  );
}

describe("GET /api/profile", () => {
  it("returns 400 when url is missing", async () => {
    const res = await GET(new Request("http://localhost/api/profile"));
    expect(res.status).toBe(400);
  });

  it("returns 400 on unknown profile id", async () => {
    const res = await GET(mkReq("https://example.com", "made-up"));
    expect(res.status).toBe(400);
  });

  it("returns rawHttp profile result for a valid request", async () => {
    const res = await GET(mkReq("https://example.com", "rawHttp"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe("rawHttp");
    expect(body.ok).toBe(true);
    expect(body.markdown).toContain("Charges API");
  });

  it("returns structured profile result when asked", async () => {
    const res = await GET(mkReq("https://example.com", "structured"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe("structured");
    expect(body.markdown).toContain("TechArticle");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/api/profile.test.ts
```

Expected: FAIL — `@/app/api/profile/route` not found.

- [ ] **Step 3: Implement the route**

Create `src/app/api/profile/route.ts`:

```ts
import { NextResponse } from "next/server";
import { isProfileId, DEFAULT_FETCH_CONTEXT } from "@/lib/core/types";
import { rawHttpProfile } from "@/lib/profiles/rawHttp";
import { readabilityProfile } from "@/lib/profiles/readability";
import { structuredProfile } from "@/lib/profiles/structured";
import { jinaProfile } from "@/lib/profiles/jina";
import { headlessProfile } from "@/lib/profiles/headless";
import { axTreeProfile } from "@/lib/profiles/axTree";
import { BrowserPool } from "@/lib/core/browser-pool";

const browserPool = new BrowserPool({
  maxContexts: 4,
  userAgent: DEFAULT_FETCH_CONTEXT.userAgent,
});

export async function GET(req: Request) {
  const url = new URL(req.url);
  const target = url.searchParams.get("url");
  const profileId = url.searchParams.get("profile") ?? "rawHttp";
  if (!target) {
    return NextResponse.json({ error: "missing url" }, { status: 400 });
  }
  if (!isProfileId(profileId)) {
    return NextResponse.json(
      { error: `unknown profile: ${profileId}` },
      { status: 400 }
    );
  }
  const ctx = {
    url: target,
    userAgent: DEFAULT_FETCH_CONTEXT.userAgent,
    timeoutMs: DEFAULT_FETCH_CONTEXT.timeoutMs,
  };
  switch (profileId) {
    case "rawHttp":
      return NextResponse.json(await rawHttpProfile.fetch(ctx));
    case "readability":
      return NextResponse.json(await readabilityProfile.fetch(ctx));
    case "structured":
      return NextResponse.json(await structuredProfile.fetch(ctx));
    case "jina":
      return NextResponse.json(await jinaProfile.fetch(ctx));
    case "headless":
      return NextResponse.json(await headlessProfile.fetch(ctx, { pool: browserPool }));
    case "axTree":
      return NextResponse.json(await axTreeProfile.fetch(ctx, { pool: browserPool }));
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/api/profile.test.ts
```

Expected: 4 passing tests.

- [ ] **Step 5: Manual smoke test against a real URL**

```bash
npm run dev
```

In another shell:

```bash
curl -s "http://localhost:3000/api/profile?url=https://docs.stripe.com/api&profile=rawHttp" | head -c 400
curl -s "http://localhost:3000/api/profile?url=https://docs.stripe.com/api&profile=structured" | head -c 400
curl -s "http://localhost:3000/api/profile?url=https://docs.stripe.com/api&profile=jina" | head -c 400
```

Expected: each returns a JSON object with `ok: true`, non-zero `chars`, and a `markdown` string. The three should differ visibly in length and content.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/profile/route.ts tests/api/profile.test.ts
git commit -m "feat(api): GET /api/profile smoke route exercising all six profiles"
```

---

## Task 13: Plan-1 finishing checks

**Files:** none new, this is a verification task.

- [ ] **Step 1: Run the full test suite (no browser)**

```bash
npm test
```

Expected: every test from tasks 1-7 and 12 passes.

- [ ] **Step 2: Run the browser test suite**

```bash
npm run test:browser
```

Expected: every test from tasks 9-11 passes.

- [ ] **Step 3: Coverage check on `src/lib/`**

```bash
npm run test:coverage
```

Expected: coverage on `src/lib/core/`, `src/lib/profiles/`, and `src/lib/tokenizer/` ≥ 80% lines.

- [ ] **Step 4: Lint + typecheck clean**

```bash
npm run lint && npx tsc --noEmit
```

Expected: zero errors and warnings.

- [ ] **Step 5: Tag the milestone**

```bash
git tag plan1-profiles-complete
```

Plan 1 is now complete. The engine accepts a URL + profile id and returns a deterministic ProfileResult. Plan 2 will add the crawler, diff/site-stats, the prose layer, and the run orchestrator on top of this foundation.

---

## Out of scope for Plan 1 (covered by Plans 2 and 3)

- Crawler (sitemap + BFS) → Plan 2
- Multi-page orchestration → Plan 2
- Profile-aware checks refactor → Plan 2
- Vale / retext / alex / markdownlint prose layer → Plan 2
- FixEngine + per-profile attribution → Plan 2
- SSE streaming → Plan 3
- New three-section UI → Plan 3
- Per-page and per-profile drilldowns → Plan 3
- Updating `AccuracyDisclaimer` to reflect new methodology → Plan 3
