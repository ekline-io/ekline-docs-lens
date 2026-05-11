# Docs Lens v2 — Prune & Teach Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform `docs-lens-next` from an 11.6k-LOC behemoth into a focused free educational tool that shows how three named agent reader populations (Raw HTTP, Headless browser, Search snippet) read a docs site, why their differences matter, and the exact prompt to fix what's broken.

**Architecture:** Prune-first, then build. Delete unused profiles, the prose linter subsystem, the axis scorecard system, deprecated routes and components. Build a new `snippet` profile and an agent-fix prompt generator. Restructure two pages (scan summary, page drilldown). Add a `HEADLESS_BACKEND` env split that proxies through Jina Reader in production and uses Playwright locally.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Vitest, Playwright, undici, cheerio, Turndown, js-tiktoken. (Removing: Vale, retext, alex, markdownlint, @mozilla/readability, write-good, jsdom.)

**Spec:** `docs/superpowers/specs/2026-04-29-docs-lens-prune-and-teach-design.md`

**Working directory:** `/Users/bipinrimal/Downloads/Ekline/ekline-prototypes-org/docs-lens-next/`

**Branch:** `prototype/docs-lens-multi-profile` (continue here; we'll rename to v2 after merge)

---

## File Structure

### New files
- `src/lib/profiles/snippet.ts` — Search-snippet reader profile
- `src/lib/fix/prompt.ts` — Agent-fix prompt generator (Fern-style report)
- `src/lib/fix/check-fix-copy.ts` — Lookup table mapping check id → "Common fix" copy
- `src/components/scan/AgentFixPrompt.tsx` — Copyable prompt block UI
- `src/components/scan/ProfileStatusCards.tsx` — Three good/partial/broken cards
- `src/components/scan/SiteVerdict.tsx` — One-sentence verdict above the cards
- `src/components/scan/ProfileExplainerCards.tsx` — "What is Raw HTTP / Headless / Snippet"
- `src/components/scan/PageDrilldownTwoColumn.tsx` — Rendered iframe + tabbed agent views
- `src/components/scan/AgentViewTabs.tsx` — Tab strip with three agent views and divergence callout
- `src/components/scan/GradeFooter.tsx` — Footer-level grade affordance
- `src/components/HomepageDemo.tsx` — Static pre-scan visual demo
- `tests/profiles/snippet.test.ts`
- `tests/fix/prompt.test.ts`
- `tests/fix/check-fix-copy.test.ts`

### Modified
- `src/lib/core/types.ts` — `PROFILE_IDS` collapses 6 → 3
- `src/lib/core/registry.ts` — register 3 profiles
- `src/lib/core/runner.ts` — drop `runProse` call, drop prose imports
- `src/lib/core/run-types.ts` — drop `avgReadabilitySurvival` from `SiteStats` (unused after prune)
- `src/lib/fix/attribution.ts` — rebuild attribution map for 3 profiles, drop prose-source mappings
- `src/lib/fix/engine.ts` — drop `audience` and `axis` enrichment paths if those fields are no longer rendered, OR keep with simpler inputs
- `src/lib/fix/types.ts` — keep `FixSource` union but the only producers are `check` and `diff`
- `src/lib/diff/profile-diff.ts` — replace `readability` references with `snippet` where present
- `src/lib/diff/site-stats.ts` — drop `readabilitySurvival` aggregation
- `src/lib/types.ts` — `AXIS_OF` keeps existing axis assignments for surviving checks; remove prose-* keys
- `src/lib/checks/adapter.ts` — leave (site-checks unaffected)
- `src/lib/scoring.ts` — keep grade computation; UI just demotes its rendering location
- `src/app/page.tsx` — homepage prune + static demo
- `src/app/scan/[id]/page.tsx` — restructure to verdict + cards + page list + findings + AgentFixPrompt + explainer cards + grade footer
- `src/app/scan/[id]/page/[pageIndex]/page.tsx` — two-column drilldown
- `src/app/methodology/page.tsx` — short rewrite
- `src/app/api/scan/route.ts` — change `MAX_CAP` from 1000 to 50, default to 10
- `package.json` — remove unused deps (`alex`, `markdownlint`, `retext`, `retext-*`, `write-good`, `@mozilla/readability`, `jsdom`, `@types/jsdom`, `@types/write-good`)

### Deleted
- `src/lib/profiles/axTree.ts`
- `src/lib/profiles/readability.ts`
- `src/lib/profiles/structured.ts`
- `src/lib/profiles/jina.ts`
- `src/lib/prose/` (whole directory: `alex.ts`, `markdownlint.ts`, `retext.ts`, `runner.ts`, `vale.ts`)
- `src/lib/why-content.ts`
- `src/lib/fix/recipes.ts` (audience-classifier; replaced by per-check fix copy in `check-fix-copy.ts`)
- `src/lib/fix/axes.ts` (axis classifier; not used after axis scorecard goes)
- `src/lib/diff/run-diff.ts`
- `src/components/AxisExpansion.tsx`
- `src/components/axis/` (whole directory)
- `src/components/HistorySidebar.tsx`
- `src/components/ContentBudgetBar.tsx`
- `src/components/ScoreBar.tsx`
- `src/components/TrendSparkline.tsx`
- `src/components/DiagnosticHero.tsx`
- `src/components/AgentPanel.tsx`, `src/components/HumanPanel.tsx`, `src/components/ShareRow.tsx` (legacy single-page-scan UI)
- `src/components/scan/RecentScans.tsx`
- `src/components/scan/AxisScorecard.tsx`
- `src/components/scan/ProfileTabs.tsx`
- `src/components/scan/ProfileDrilldown.tsx`
- `src/components/scan/RunCompare.tsx`
- `src/components/scan/DeltaStrip.tsx`
- `src/app/scan/[id]/profile/[profileId]/page.tsx`
- `src/app/scan/[id]/compare/[other]/page.tsx`
- `src/app/api/profile/route.ts`
- `src/app/api/profiles/route.ts`
- `src/app/api/badge/route.ts`
- `src/hooks/useScanHistory.ts`
- `tests/profiles/jina.test.ts`
- `tests/profiles/readability.test.ts`
- `tests/profiles/structured.test.ts`
- `tests/prose/` (whole directory if exists)
- `tests/fix/recipes.test.ts`
- `tests/fix/axes.test.ts`
- `tests/diff/run-diff.test.ts` (if exists)

---

## Phase A — Build snippet profile (TDD)

We add the new profile *before* deleting the old ones so the registry never has zero working profiles between commits.

### Task 1: Write failing test for snippet profile

**Files:**
- Create: `tests/profiles/snippet.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/profiles/snippet.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { snippetProfile } from "@/lib/profiles/snippet";

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

describe("snippetProfile", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", undefined);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("extracts title, description, og tags, first H1 and ~200 char preview", async () => {
    const undici = await import("undici");
    const requestSpy = vi.spyOn(undici, "request").mockResolvedValue({
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
    requestSpy.mockRestore();
  });

  it("returns ok=false on HTTP error", async () => {
    const undici = await import("undici");
    const requestSpy = vi.spyOn(undici, "request").mockResolvedValue({
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
    requestSpy.mockRestore();
  });

  it("returns ok=true with empty markdown on a metadata-less page", async () => {
    const undici = await import("undici");
    const requestSpy = vi.spyOn(undici, "request").mockResolvedValue({
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
    requestSpy.mockRestore();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/profiles/snippet.test.ts`
Expected: FAIL with "Cannot find module '@/lib/profiles/snippet'"

### Task 2: Implement snippet profile

**Files:**
- Create: `src/lib/profiles/snippet.ts`
- Modify: `src/lib/core/types.ts:1-8` to include `snippet` in `PROFILE_IDS`

- [ ] **Step 1: Add `snippet` to PROFILE_IDS (transitional — registry still has 6)**

Edit `src/lib/core/types.ts`:

```typescript
export const PROFILE_IDS = [
  "rawHttp",
  "readability",
  "headless",
  "axTree",
  "structured",
  "jina",
  "snippet",
] as const;
```

- [ ] **Step 2: Implement the profile**

Create `src/lib/profiles/snippet.ts`:

```typescript
import { request } from "undici";
import * as cheerio from "cheerio";
import { emptyResult, type Profile } from "@/lib/core/profile";
import type { FetchContext, ProfileResult } from "@/lib/core/types";
import { countTokens } from "@/lib/tokenizer/count";

const PREVIEW_CHARS = 200;

interface Snippet {
  title: string | null;
  description: string | null;
  og: Record<string, string>;
  twitter: Record<string, string>;
  firstH1: string | null;
  preview: string;
  jsonLd: unknown[];
}

function extract(html: string): Snippet {
  const $ = cheerio.load(html);
  const title = $("title").first().text().trim() || null;
  const description = $('meta[name="description"]').attr("content")?.trim() ?? null;
  const og: Record<string, string> = {};
  $('meta[property^="og:"]').each((_, el) => {
    const k = $(el).attr("property");
    const v = $(el).attr("content");
    if (k && v) og[k] = v;
  });
  const twitter: Record<string, string> = {};
  $('meta[name^="twitter:"]').each((_, el) => {
    const k = $(el).attr("name");
    const v = $(el).attr("content");
    if (k && v) twitter[k] = v;
  });
  const firstH1 = $("h1").first().text().trim() || null;
  // First ~200 chars of visible body text. Strip script/style first so we
  // don't pull JS into the "preview".
  $("script,style,noscript,template").remove();
  const bodyText = $("body").text().replace(/\s+/g, " ").trim();
  const preview = bodyText.slice(0, PREVIEW_CHARS);
  const jsonLd: unknown[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).contents().text();
    try {
      jsonLd.push(JSON.parse(raw));
    } catch {
      // malformed JSON-LD ignored — surfaces as a future check finding
    }
  });
  return { title, description, og, twitter, firstH1, preview, jsonLd };
}

function toMarkdown(s: Snippet): string {
  const lines: string[] = [];
  if (s.title) lines.push(`Title: ${s.title}`);
  if (s.description) lines.push(`Description: ${s.description}`);
  for (const [k, v] of Object.entries(s.og)) lines.push(`${k}: ${v}`);
  for (const [k, v] of Object.entries(s.twitter)) lines.push(`${k}: ${v}`);
  if (s.firstH1) lines.push(`First H1: ${s.firstH1}`);
  if (s.jsonLd.length) {
    lines.push("");
    lines.push("JSON-LD:");
    for (const item of s.jsonLd) {
      lines.push(JSON.stringify(item));
    }
  }
  lines.push("");
  lines.push(`Preview (${s.preview.length} chars):`);
  lines.push(s.preview);
  return lines.join("\n");
}

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
    const ok = res.statusCode >= 200 && res.statusCode < 400;
    if (!ok) {
      return emptyResult("snippet", `HTTP ${res.statusCode}`, Date.now() - start);
    }
    const snippet = extract(body);
    const markdown = toMarkdown(snippet);
    const { claude, gpt } = countTokens(markdown);
    return {
      id: "snippet",
      ok: true,
      bytes: Buffer.byteLength(markdown, "utf8"),
      chars: markdown.length,
      tokensClaude: claude,
      tokensGpt: gpt,
      markdown,
      rawArtifact: JSON.stringify(snippet),
      durationMs: Date.now() - start,
    };
  } catch (e) {
    return emptyResult(
      "snippet",
      e instanceof Error ? e.message : "fetch failed",
      Date.now() - start
    );
  }
}

export const snippetProfile: Profile = { id: "snippet", fetch: doFetch };
```

- [ ] **Step 3: Register the profile**

Edit `src/lib/core/registry.ts` — add the import and registration alongside the existing six (we'll prune in Phase B):

```typescript
// add import:
import { snippetProfile } from "@/lib/profiles/snippet";

// add registration at the bottom of the file:
registerProfile({ id: "snippet", kind: "single-arg", fetch: snippetProfile.fetch });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/profiles/snippet.test.ts`
Expected: PASS, 3 tests

- [ ] **Step 5: Run typecheck and full test suite to confirm no regressions**

Run: `npx tsc --noEmit && npx vitest run`
Expected: PASS for typecheck. Existing test suite passes (snippet is additive).

- [ ] **Step 6: Commit**

```bash
git add src/lib/profiles/snippet.ts src/lib/core/types.ts src/lib/core/registry.ts tests/profiles/snippet.test.ts
git commit -m "feat(profiles): add snippet profile (title, meta, OG, first H1, 200-char preview)"
```

---

## Phase B — Collapse to three profiles

Remove `axTree`, `readability`, `structured`, `jina`. Update every site that references them.

### Task 3: Delete obsolete profile files and tests

**Files:**
- Delete: `src/lib/profiles/axTree.ts`
- Delete: `src/lib/profiles/readability.ts`
- Delete: `src/lib/profiles/structured.ts`
- Delete: `src/lib/profiles/jina.ts`
- Delete: `tests/profiles/jina.test.ts`
- Delete: `tests/profiles/readability.test.ts`
- Delete: `tests/profiles/structured.test.ts`

- [ ] **Step 1: Remove the files**

```bash
rm src/lib/profiles/axTree.ts
rm src/lib/profiles/readability.ts
rm src/lib/profiles/structured.ts
rm src/lib/profiles/jina.ts
rm tests/profiles/jina.test.ts
rm tests/profiles/readability.test.ts
rm tests/profiles/structured.test.ts
```

### Task 4: Update PROFILE_IDS, registry, attribution, AXIS_OF in one atomic edit

**Files:**
- Modify: `src/lib/core/types.ts:1-8`
- Modify: `src/lib/core/registry.ts` (entire file)
- Modify: `src/lib/fix/attribution.ts` (entire file)
- Modify: `src/lib/diff/profile-diff.ts` (review + edit)
- Modify: `src/lib/diff/site-stats.ts` (drop `readabilitySurvival`)
- Modify: `src/lib/core/run-types.ts` (drop `avgReadabilitySurvival`)

- [ ] **Step 1: Replace PROFILE_IDS**

Edit `src/lib/core/types.ts`:

```typescript
export const PROFILE_IDS = ["rawHttp", "headless", "snippet"] as const;
```

- [ ] **Step 2: Rewrite registry.ts**

Replace `src/lib/core/registry.ts` contents:

```typescript
import type { FetchContext, ProfileId, ProfileResult } from "./types";
import type { BrowserCtx } from "./browser-ctx";

import { rawHttpProfile } from "@/lib/profiles/rawHttp";
import { headlessProfile } from "@/lib/profiles/headless";
import { snippetProfile } from "@/lib/profiles/snippet";

export type RegisteredProfile =
  | {
      id: ProfileId;
      kind: "single-arg";
      fetch: (ctx: FetchContext) => Promise<ProfileResult>;
    }
  | {
      id: ProfileId;
      kind: "two-arg";
      fetch: (ctx: FetchContext, deps: BrowserCtx) => Promise<ProfileResult>;
    };

const registry = new Map<ProfileId, RegisteredProfile>();

export function registerProfile(p: RegisteredProfile): void {
  registry.set(p.id, p);
}

export function allProfiles(): RegisteredProfile[] {
  return [...registry.values()];
}

export async function runProfile(
  id: ProfileId,
  ctx: FetchContext,
  deps?: BrowserCtx,
): Promise<ProfileResult> {
  const entry = registry.get(id);
  if (!entry) throw new Error(`unknown profile: ${id}`);
  if (entry.kind === "single-arg") return entry.fetch(ctx);
  if (!deps) {
    throw new Error(`profile ${id} requires BrowserCtx deps`);
  }
  return entry.fetch(ctx, deps);
}

registerProfile({ id: "rawHttp", kind: "single-arg", fetch: rawHttpProfile.fetch });
registerProfile({ id: "headless", kind: "two-arg", fetch: headlessProfile.fetch });
registerProfile({ id: "snippet", kind: "single-arg", fetch: snippetProfile.fetch });
```

- [ ] **Step 3: Rewrite attribution.ts**

Replace `src/lib/fix/attribution.ts` contents:

```typescript
import type { ProfileId } from "@/lib/core/types";

/**
 * Hand-curated map of finding-id → affected profiles. Three real reader
 * populations only: rawHttp, headless, snippet. Anything not in this map
 * returns "general" — we will not fake attribution to make findings tag
 * fuller than the evidence supports.
 */
const ATTRIBUTION: Record<string, ProfileId[]> = {
  // llms.txt missing/broken: hurts every reader that consults it. Coding
  // agents (rawHttp) and search-snippet consumers both check llms.txt
  // for orientation; headless browsers usually don't.
  "llms-txt-exists": ["rawHttp", "snippet"],
  "llms-txt-valid": ["rawHttp", "snippet"],
  "llms-txt-directive": ["rawHttp", "snippet"],
  "llms-txt-links-resolve": ["rawHttp"],
  "llms-txt-links-markdown": ["rawHttp"],

  // Markdown URL support / content negotiation: only the rawHttp/coding-agent
  // family asks for markdown via Accept header. Headless and snippet don't.
  "markdown-url-support": ["rawHttp"],
  "content-negotiation": ["rawHttp"],

  // Rendering strategy (CSR vs SSR/SSG): hurts rawHttp and snippet because
  // both read pre-JS HTML. Headless renders post-JS so it's unaffected.
  "rendering-strategy": ["rawHttp", "snippet"],

  // Page size (markdown / HTML): bytes-budget concern hits rawHttp hardest
  // (Claude Code's WebFetch caps at 100KB markdown). Headless feeds richer
  // text but its consumers also have caps. Snippet only reads metadata so
  // page size doesn't affect it.
  "page-size-markdown": ["rawHttp"],
  "page-size-html": ["rawHttp", "headless"],
  "content-start-position": ["rawHttp"],

  // Tabbed content / JS-only widgets: rawHttp and snippet miss them; headless
  // sees them post-render.
  "tabbed-content-serialization": ["rawHttp", "snippet"],

  // Metadata completeness: snippet readers depend on title/description/OG
  // and nothing else.
  "metadata-completeness": ["snippet"],

  // Auth gating: blocks every reader that hits the URL.
  "auth-gate-detection": ["rawHttp", "headless", "snippet"],
  "auth-alternative-access": ["rawHttp", "headless", "snippet"],

  // Well-known endpoints (MCP, agent skills, API catalog): coding-agent
  // discovery surface. snippet readers also peek at API catalogs through
  // structured data.
  "well-known-mcp-card": ["rawHttp"],
  "well-known-agent-skills": ["rawHttp"],
  "well-known-api-catalog": ["rawHttp", "snippet"],
  "link-header-api-catalog": ["rawHttp"],

  // Robots policy / content signals: snippet/answer-engine consumers rely
  // on these.
  "robots-txt": ["snippet"],
  "content-signals": ["snippet"],

  // HTTP status / redirects / URL stability: every fetcher cares.
  "http-status-codes": ["rawHttp", "headless", "snippet"],
  "redirect-behavior": ["rawHttp", "headless", "snippet"],

  // Markdown structure issues affect rawHttp's Turndown output most directly;
  // headless re-runs Turndown on a richer DOM and survives more.
  "markdown-code-fence-validity": ["rawHttp"],
  "heading-hierarchy": ["rawHttp", "snippet"],
  "image-alt-coverage": ["rawHttp", "headless"],
  "json-code-block-validity": ["rawHttp"],
  "internal-link-integrity": ["rawHttp", "headless"],
};

export function attributionFor(findingId: string): ProfileId[] | "general" {
  const exact = ATTRIBUTION[findingId];
  if (exact) return exact;
  return "general";
}
```

- [ ] **Step 4: Update profile-diff.ts**

Read `src/lib/diff/profile-diff.ts` first. If it references `readability`, `axTree`, `structured`, or `jina`, replace those references with `headless` (largest profile fallback) or remove them. The `largestProfile` calculation should now consider only `rawHttp`, `headless`, `snippet`. Keep the `jsGatedFraction` formula `(headless.chars - rawHttp.chars) / max(1, headless.chars)`. **Remove** the `readabilitySurvival` field from `PageDiff` (in `run-types.ts`) and from this file.

- [ ] **Step 5: Update site-stats.ts**

Read `src/lib/diff/site-stats.ts`. Drop the `avgReadabilitySurvival` aggregation. Update `avgTokensClaudePerProfile` to iterate only the surviving 3 ids.

- [ ] **Step 6: Update run-types.ts**

Edit `src/lib/core/run-types.ts`:
- Remove `readabilitySurvival` from `PageDiff`
- Remove `avgReadabilitySurvival` from `SiteStats`

- [ ] **Step 7: Run typecheck**

Run: `npx tsc --noEmit`
Expected: typecheck passes. If errors surface in UI components (`PageMatrix`, `FixList`, `ProfileTabs`, etc.), continue to the UI-prune phase — those will be deleted, but for now annotate failing components with `// TODO: pruned in Phase D` and remove the broken references inline.

- [ ] **Step 8: Run tests**

Run: `npx vitest run`
Expected: snippet/rawHttp/headless tests pass; attribution tests need updating (see step 9).

- [ ] **Step 9: Update attribution tests**

Edit `tests/fix/attribution.test.ts` to use new mappings. Replace any references to `readability`, `structured`, `jina` profile IDs with `rawHttp` / `headless` / `snippet` per the new ATTRIBUTION map. Update assertions accordingly.

- [ ] **Step 10: Re-run tests**

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 11: Commit**

```bash
git add src/lib/core/types.ts src/lib/core/registry.ts src/lib/core/run-types.ts \
        src/lib/fix/attribution.ts src/lib/diff/profile-diff.ts src/lib/diff/site-stats.ts \
        tests/fix/attribution.test.ts
git rm src/lib/profiles/axTree.ts src/lib/profiles/readability.ts \
       src/lib/profiles/structured.ts src/lib/profiles/jina.ts \
       tests/profiles/jina.test.ts tests/profiles/readability.test.ts \
       tests/profiles/structured.test.ts
git commit -m "refactor(profiles): collapse to 3 profiles (rawHttp/headless/snippet)"
```

---

## Phase C — Delete the prose subsystem

Removes Vale, retext, alex, markdownlint runners and their integration into the runner.

### Task 5: Cut prose dependencies out of runner.ts and fix engine

**Files:**
- Modify: `src/lib/core/runner.ts:15-18, 165-173`
- Modify: `src/lib/fix/engine.ts:1-56`
- Modify: `src/lib/fix/types.ts:5`

- [ ] **Step 1: Remove the prose call from runner.ts**

Edit `src/lib/core/runner.ts`:
- Remove the import line: `import { runProse } from "@/lib/prose/runner";`
- Remove the entire prose block (currently around lines 165-173):

```typescript
// Delete this block:
const proseInput = page.profiles.headless?.ok && page.profiles.headless.markdown
  ? page.profiles.headless.markdown
  : (page.profiles.rawHttp?.markdown ?? "");
const findings = await runProse(proseInput, url);
allFindings.push(...findings);
onEvent({ type: "prose:done", url, findings: findings.length });
```

- [ ] **Step 2: Drop the `prose:done` event variant**

Edit `src/lib/core/run-types.ts` — remove from the `RunEvent` union:

```typescript
| { type: "prose:done"; url: string; findings: number }
```

- [ ] **Step 3: Trim FixSource union**

Edit `src/lib/fix/types.ts`:

```typescript
export type FixSource = "check" | "diff";
```

- [ ] **Step 4: Update fix engine SOURCE_RANK**

Edit `src/lib/fix/engine.ts`:

```typescript
const SOURCE_RANK: Record<FixSource, number> = {
  check: 0,
  diff: 1,
};
```

Also remove imports of `recipeFor`, `axisFor`, `classifyAudience` (we delete those modules in the next task) and remove their calls inside `mergeAndRank`. Replace the relevant lines in `mergeAndRank`:

```typescript
byId.set(f.id, {
  ...f,
  affectedProfiles: attributionFor(f.id),
});
```

- [ ] **Step 5: Update FixFinding type to drop dropped fields**

Edit `src/lib/fix/types.ts` — remove `audience`, `axis`, `recipe`, `FixAxis`, `FixAudience`, `FixRecipe` exports. Surviving shape:

```typescript
import type { ProfileId } from "@/lib/core/types";

export type FixSeverity = "fail" | "warn" | "info";
export type FixSource = "check" | "diff";

export interface FixFinding {
  id: string;
  title: string;
  severity: FixSeverity;
  source: FixSource;
  evidence: string;
  affectedProfiles: ProfileId[] | "general";
  fixHint: string;
  pageUrl: string;
  occurrences: number;
}
```

- [ ] **Step 6: Run typecheck — expect failures in UI/checks files that referenced dropped fields**

Run: `npx tsc --noEmit`

For each error, fix in place by deleting the references. The doomed UI components (`AxisScorecard`, `AxisExpansion`, `axis/*`) are deleted in Phase D; for now you can leave them broken — TypeScript errors are tolerable inside files we're about to delete, but mark the file with a `// @ts-nocheck` comment at the top of any file that's slated for deletion to keep the build green for other work.

- [ ] **Step 7: Commit**

```bash
git add src/lib/core/runner.ts src/lib/core/run-types.ts \
        src/lib/fix/engine.ts src/lib/fix/types.ts
git commit -m "refactor(engine): drop prose findings + audience/axis enrichment from fix engine"
```

### Task 6: Delete the prose directory and recipes/axes modules

**Files:**
- Delete: `src/lib/prose/` (entire directory)
- Delete: `src/lib/fix/recipes.ts`
- Delete: `src/lib/fix/axes.ts`
- Delete: `src/lib/why-content.ts`
- Delete: `tests/prose/` (if it exists)
- Delete: `tests/fix/recipes.test.ts`
- Delete: `tests/fix/axes.test.ts`

- [ ] **Step 1: Remove the directories and files**

```bash
rm -rf src/lib/prose
rm src/lib/fix/recipes.ts src/lib/fix/axes.ts
rm -f src/lib/why-content.ts
rm -rf tests/prose
rm -f tests/fix/recipes.test.ts tests/fix/axes.test.ts
```

- [ ] **Step 2: Find and delete remaining references**

Run: `grep -rn "from.*prose\|from.*fix/recipes\|from.*fix/axes\|why-content" src/ tests/`
Expected: no output. If results appear, edit each file to remove the import + its usage.

- [ ] **Step 3: Run typecheck and tests**

Run: `npx tsc --noEmit && npx vitest run`
Expected: PASS

- [ ] **Step 4: Remove prose dependencies from package.json**

Edit `package.json` — remove from `dependencies`:
- `alex`
- `markdownlint`
- `remark`
- `remark-parse`
- `retext`
- `retext-english`
- `retext-passive`
- `retext-readability`
- `retext-simplify`
- `retext-stringify`
- `unified`
- `unist-util-visit`
- `write-good`
- `@mozilla/readability`
- `jsdom`

Remove from `devDependencies`:
- `@types/jsdom`
- `@types/write-good`

- [ ] **Step 5: Reinstall**

```bash
rm -rf node_modules package-lock.json
npm install
```

- [ ] **Step 6: Verify build**

Run: `npm run build`
Expected: build succeeds. If a stray import remains, fix it.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json
git rm -r src/lib/prose src/lib/fix/recipes.ts src/lib/fix/axes.ts \
       src/lib/why-content.ts tests/fix/recipes.test.ts tests/fix/axes.test.ts
# tests/prose only if present:
git rm -r tests/prose 2>/dev/null || true
git commit -m "refactor: delete prose subsystem (Vale/retext/alex/markdownlint) and recipe/axis classifiers"
```

---

## Phase D — Delete deprecated UI surface

### Task 7: Delete deprecated routes and their tests

**Files:**
- Delete: `src/app/scan/[id]/profile/[profileId]/page.tsx`
- Delete: `src/app/scan/[id]/compare/[other]/page.tsx`
- Delete: `src/app/api/profile/route.ts`
- Delete: `src/app/api/profiles/route.ts`
- Delete: `src/app/api/badge/route.ts`

- [ ] **Step 1: Remove the route files**

```bash
rm src/app/scan/[id]/profile/[profileId]/page.tsx
rmdir src/app/scan/[id]/profile/[profileId] src/app/scan/[id]/profile 2>/dev/null || true
rm src/app/scan/[id]/compare/[other]/page.tsx
rmdir src/app/scan/[id]/compare/[other] src/app/scan/[id]/compare 2>/dev/null || true
rm src/app/api/profile/route.ts
rmdir src/app/api/profile 2>/dev/null || true
rm src/app/api/profiles/route.ts
rmdir src/app/api/profiles 2>/dev/null || true
rm src/app/api/badge/route.ts
rmdir src/app/api/badge 2>/dev/null || true
```

- [ ] **Step 2: Remove `src/lib/badge.ts`**

```bash
rm -f src/lib/badge.ts
```

- [ ] **Step 3: Verify no internal links break**

Run: `grep -rn "/api/profile\|/api/profiles\|/api/badge\|/scan/\\[id\\]/profile\|/scan/\\[id\\]/compare\|compare/\[other\]\|profile/\[profileId\]" src/`
Expected: no output (any remaining references in `ScanHeader`, page links, or anywhere else need to be removed).

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git rm src/app/scan/[id]/profile/[profileId]/page.tsx \
       src/app/scan/[id]/compare/[other]/page.tsx \
       src/app/api/profile/route.ts src/app/api/profiles/route.ts \
       src/app/api/badge/route.ts
git rm -f src/lib/badge.ts
git commit -m "refactor(routes): remove per-profile drilldown, comparison route, badge endpoint"
```

### Task 8: Delete deprecated UI components

**Files:**
- Delete: `src/components/AxisExpansion.tsx`
- Delete: `src/components/axis/` (entire directory)
- Delete: `src/components/HistorySidebar.tsx`
- Delete: `src/components/ContentBudgetBar.tsx`
- Delete: `src/components/ScoreBar.tsx`
- Delete: `src/components/TrendSparkline.tsx`
- Delete: `src/components/DiagnosticHero.tsx`
- Delete: `src/components/AgentPanel.tsx`
- Delete: `src/components/HumanPanel.tsx`
- Delete: `src/components/ShareRow.tsx`
- Delete: `src/components/scan/AxisScorecard.tsx`
- Delete: `src/components/scan/RecentScans.tsx`
- Delete: `src/components/scan/ProfileTabs.tsx`
- Delete: `src/components/scan/ProfileDrilldown.tsx`
- Delete: `src/components/scan/RunCompare.tsx`
- Delete: `src/components/scan/DeltaStrip.tsx`
- Delete: `src/hooks/useScanHistory.ts`
- Modify: `src/app/page.tsx` — remove `RecentScans` import + usage
- Modify: `src/app/scan/[id]/page.tsx` — remove imports of all deleted components

- [ ] **Step 1: Remove component files**

```bash
rm -f src/components/AxisExpansion.tsx
rm -rf src/components/axis
rm -f src/components/HistorySidebar.tsx
rm -f src/components/ContentBudgetBar.tsx
rm -f src/components/ScoreBar.tsx
rm -f src/components/TrendSparkline.tsx
rm -f src/components/DiagnosticHero.tsx
rm -f src/components/AgentPanel.tsx
rm -f src/components/HumanPanel.tsx
rm -f src/components/ShareRow.tsx
rm -f src/components/scan/AxisScorecard.tsx
rm -f src/components/scan/RecentScans.tsx
rm -f src/components/scan/ProfileTabs.tsx
rm -f src/components/scan/ProfileDrilldown.tsx
rm -f src/components/scan/RunCompare.tsx
rm -f src/components/scan/DeltaStrip.tsx
rm -f src/hooks/useScanHistory.ts
```

- [ ] **Step 2: Strip imports from src/app/page.tsx**

Edit `src/app/page.tsx` — remove `import { RecentScans } from "@/components/scan/RecentScans";` and any `<RecentScans />` usage. We rebuild this page in Task 14 — for now just make it compile.

- [ ] **Step 3: Strip imports from src/app/scan/[id]/page.tsx**

Edit `src/app/scan/[id]/page.tsx` — remove imports for `DeltaStrip`, `AxisScorecard`, `ProfileTabs`. Remove their JSX usage. Remove the `useScanHistory` import and its `addToHistory` effect. Leave the page minimally rendering `<ScanHeader>`, `<ScanProgress>`, `<PageMatrix>`, `<FixList>`, `<AccuracyDisclaimer>` for now — Phase F restructures it.

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/app/page.tsx src/app/scan/[id]/page.tsx
git rm src/components/AxisExpansion.tsx src/components/HistorySidebar.tsx \
       src/components/ContentBudgetBar.tsx src/components/ScoreBar.tsx \
       src/components/TrendSparkline.tsx src/components/DiagnosticHero.tsx \
       src/components/AgentPanel.tsx src/components/HumanPanel.tsx \
       src/components/ShareRow.tsx \
       src/components/scan/AxisScorecard.tsx src/components/scan/RecentScans.tsx \
       src/components/scan/ProfileTabs.tsx src/components/scan/ProfileDrilldown.tsx \
       src/components/scan/RunCompare.tsx src/components/scan/DeltaStrip.tsx \
       src/hooks/useScanHistory.ts
git rm -r src/components/axis 2>/dev/null || true
git commit -m "refactor(ui): delete axis scorecard, history sidebar, comparison view, and legacy single-page-scan components"
```

---

## Phase E — Headless backend swap (Playwright local / Jina production)

### Task 9: Add HEADLESS_BACKEND env split with Jina Reader fallback

**Files:**
- Modify: `src/lib/profiles/headless.ts` (entire file)
- Create: `tests/profiles/headless-jina.test.ts`

- [ ] **Step 1: Write failing test for the Jina backend**

Create `tests/profiles/headless-jina.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { headlessProfile } from "@/lib/profiles/headless";

describe("headless profile (Jina backend)", () => {
  beforeEach(() => {
    process.env.HEADLESS_BACKEND = "jina";
  });
  afterEach(() => {
    delete process.env.HEADLESS_BACKEND;
    vi.unstubAllGlobals();
  });

  it("proxies through r.jina.ai when HEADLESS_BACKEND=jina", async () => {
    const undici = await import("undici");
    const requestSpy = vi.spyOn(undici, "request").mockResolvedValue({
      statusCode: 200,
      body: { text: async () => "# Hello\n\nWorld" },
    } as never);

    const result = await headlessProfile.fetch(
      { url: "https://example.com/x", userAgent: "test", timeoutMs: 5000 },
      { pool: { acquire: () => { throw new Error("pool should not be used"); }, release: () => {} } } as never,
    );

    expect(result.id).toBe("headless");
    expect(result.ok).toBe(true);
    expect(result.markdown).toContain("Hello");
    expect(requestSpy.mock.calls[0]?.[0]).toBe("https://r.jina.ai/https://example.com/x");
    requestSpy.mockRestore();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/profiles/headless-jina.test.ts`
Expected: FAIL — current headless.ts uses Playwright unconditionally.

- [ ] **Step 3: Update headless.ts to branch on env**

Replace `src/lib/profiles/headless.ts` contents:

```typescript
import { request } from "undici";
import TurndownService from "turndown";
import { emptyResult } from "@/lib/core/profile";
import type { FetchContext, ProfileId, ProfileResult } from "@/lib/core/types";
import type { BrowserCtx } from "@/lib/core/browser-ctx";
import { countTokens } from "@/lib/tokenizer/count";

export type { BrowserCtx } from "@/lib/core/browser-ctx";

const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  bulletListMarker: "-",
});

async function fetchViaPlaywright(
  ctx: FetchContext,
  deps: BrowserCtx,
): Promise<ProfileResult> {
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
      Date.now() - start,
    );
  } finally {
    await deps.pool.release(browserCtx);
  }
}

async function fetchViaJina(ctx: FetchContext): Promise<ProfileResult> {
  const start = Date.now();
  try {
    // r.jina.ai proxies the URL through Puppeteer + headless Chrome and
    // returns markdown directly.
    const proxiedUrl = `https://r.jina.ai/${ctx.url}`;
    const res = await request(proxiedUrl, {
      method: "GET",
      headers: {
        "user-agent": ctx.userAgent,
        accept: "text/markdown",
      },
      bodyTimeout: ctx.timeoutMs,
      headersTimeout: ctx.timeoutMs,
      signal: ctx.signal,
    } as Parameters<typeof request>[1]);
    const markdown = await res.body.text();
    if (res.statusCode < 200 || res.statusCode >= 400) {
      return emptyResult("headless", `Jina HTTP ${res.statusCode}`, Date.now() - start);
    }
    const { claude, gpt } = countTokens(markdown);
    return {
      id: "headless",
      ok: true,
      bytes: Buffer.byteLength(markdown, "utf8"),
      chars: markdown.length,
      tokensClaude: claude,
      tokensGpt: gpt,
      markdown,
      rawArtifact: markdown,
      durationMs: Date.now() - start,
    };
  } catch (e) {
    return emptyResult(
      "headless",
      e instanceof Error ? e.message : "jina fetch failed",
      Date.now() - start,
    );
  }
}

async function doFetch(ctx: FetchContext, deps: BrowserCtx): Promise<ProfileResult> {
  const backend = process.env.HEADLESS_BACKEND ?? "playwright";
  if (backend === "jina") return fetchViaJina(ctx);
  return fetchViaPlaywright(ctx, deps);
}

export interface HeadlessProfile {
  readonly id: ProfileId;
  fetch: (ctx: FetchContext, deps: BrowserCtx) => Promise<ProfileResult>;
}

export const headlessProfile: HeadlessProfile = {
  id: "headless",
  fetch: doFetch,
};
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/profiles/headless-jina.test.ts tests/profiles/rawHttp.test.ts tests/profiles/snippet.test.ts`
Expected: PASS

- [ ] **Step 5: Document the env in `.env.example` (create if missing)**

Create or edit `.env.example`:

```
# Headless profile backend. "playwright" (default) runs local Chromium.
# "jina" proxies through https://r.jina.ai for hosted environments where
# bundling Playwright isn't viable (e.g. Vercel).
HEADLESS_BACKEND=playwright
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/profiles/headless.ts tests/profiles/headless-jina.test.ts .env.example
git commit -m "feat(headless): swap to Jina Reader proxy when HEADLESS_BACKEND=jina"
```

---

## Phase F — Build the agent-fix prompt generator

### Task 10: Write fix-copy lookup table (TDD)

**Files:**
- Create: `tests/fix/check-fix-copy.test.ts`
- Create: `src/lib/fix/check-fix-copy.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/fix/check-fix-copy.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { fixCopyFor, allFixCopyKeys } from "@/lib/fix/check-fix-copy";

describe("check-fix-copy", () => {
  it("returns concrete fix copy for known check ids", () => {
    const llms = fixCopyFor("llms-txt-exists");
    expect(llms).toBeTruthy();
    expect(llms?.short).toContain("llms.txt");
    expect(llms?.long).toContain("llmstxt.org");
  });

  it("returns null for unknown check ids", () => {
    expect(fixCopyFor("nonexistent-check-id")).toBeNull();
  });

  it("covers every check id in the AXIS_OF map", async () => {
    const { AXIS_OF } = await import("@/lib/types");
    const missing = Object.keys(AXIS_OF)
      .filter((k) => !k.startsWith("prose-"))
      .filter((k) => !fixCopyFor(k));
    expect(missing, `missing fix copy for: ${missing.join(", ")}`).toEqual([]);
  });

  it("exposes its key list", () => {
    const keys = allFixCopyKeys();
    expect(keys.length).toBeGreaterThan(10);
    expect(keys).toContain("llms-txt-exists");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/fix/check-fix-copy.test.ts`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement check-fix-copy**

Create `src/lib/fix/check-fix-copy.ts`:

```typescript
/**
 * Per-check fix copy used both in the UI ("why this matters") and in the
 * agent-fix prompt ("Common fixes" block). Single source of truth — adding
 * a new check should add a row here.
 *
 * `short` is one line for the prompt's bullet list. `long` is 1-3 sentences
 * for the UI card.
 */
export interface FixCopy {
  short: string;
  long: string;
}

const COPY: Record<string, FixCopy> = {
  "llms-txt-exists": {
    short:
      "Create /llms.txt following https://llmstxt.org — list all doc pages in markdown format.",
    long:
      "An /llms.txt file gives coding agents a manifest of your documentation. Without it, agents like Claude Code and Cursor have no shortcut to your structured docs and must crawl the whole site to find anything.",
  },
  "llms-txt-valid": {
    short:
      "Fix /llms.txt formatting — the file exists but has malformed entries that agents can't parse.",
    long:
      "Agents parse llms.txt as a structured manifest. Malformed lines cause the entire file to be discarded silently, undoing the discoverability win of having one.",
  },
  "llms-txt-directive": {
    short:
      "Add an llms.txt directive (link or HTTP header) so agents can find it without guessing the path.",
    long:
      "Even if /llms.txt exists, agents only know to look for it if your homepage points to it (`<link rel=\"llms.txt\" href=\"/llms.txt\">` or an HTTP `Link` header).",
  },
  "llms-txt-links-resolve": {
    short:
      "Every URL listed in /llms.txt must return 200. Broken links waste agent fetches.",
    long:
      "Each entry in llms.txt is a fetch budget the agent will spend. Broken URLs waste that budget and can cause agents to abandon the manifest entirely.",
  },
  "llms-txt-links-markdown": {
    short:
      "Serve every llms.txt-linked page as markdown (e.g. /docs/quickstart.md), not just HTML.",
    long:
      "llms.txt is supposed to point at machine-readable markdown. Linking HTML pages forces agents to do their own conversion, which loses code blocks and tables.",
  },
  "markdown-url-support": {
    short:
      "Configure your docs platform to serve pages at equivalent .md URLs (e.g. /docs/quickstart.md).",
    long:
      "Coding agents (Claude Code, Cursor, Continue) try the .md variant first to skip Turndown. If you only serve .html they have to convert lossy.",
  },
  "content-negotiation": {
    short:
      "Return markdown when the request has Accept: text/markdown.",
    long:
      "Modern agent fetchers (Claude Code as of v2.1.105) send Accept: text/markdown. If your server ignores it and returns HTML anyway, you lose the markdown shortcut.",
  },
  "rendering-strategy": {
    short:
      "Server-render or static-export your docs. Client-side rendering hides content from raw HTTP fetchers.",
    long:
      "Agents that don't run JavaScript (Claude Code WebFetch, Continue, Aider default) only see the initial HTML. CSR-only docs look empty to them.",
  },
  "page-size-html": {
    short:
      "Reduce nav boilerplate, inline scripts, and repetitive markup. Aim for under 1MB HTML.",
    long:
      "Headless agent fetchers cap fetch size. A page that's mostly nav and JS exhausts the budget before reaching the content.",
  },
  "page-size-markdown": {
    short:
      "Trim the markdown output. Claude Code WebFetch caps at 100KB markdown — anything past that is lost.",
    long:
      "Claude Code's pipeline truncates at 100KB of markdown before any further processing. Long pages get cut mid-content.",
  },
  "content-start-position": {
    short:
      "Move the main content within the first 50% of the page. Push nav and announcements below.",
    long:
      "Many agent extractors heuristically prioritize early content. Pages where the actual answer starts past the halfway mark often get truncated before reaching it.",
  },
  "tabbed-content-serialization": {
    short:
      "Render every tab variant in HTML, not via JS. Agents without browsers see only the first tab.",
    long:
      "JS-only tab widgets are invisible to raw HTTP fetchers. Either render all tab content in the source HTML, or serve a single linear version for non-JS readers.",
  },
  "metadata-completeness": {
    short:
      "Add `<title>`, `<meta name=\"description\">`, and OG tags to every doc page.",
    long:
      "Search-snippet readers (ChatGPT Search, Perplexity, You.com) only see your title and description. Missing metadata means missing citations.",
  },
  "auth-gate-detection": {
    short:
      "Ensure docs pages return 200 without requiring login cookies or tokens.",
    long:
      "Auth-gated docs are invisible to every agent. If a portion needs to be gated, expose an auth-free public version or robots-index allowed subset.",
  },
  "auth-alternative-access": {
    short:
      "If auth is required, document the public alternative (anonymous read endpoint, mirror site).",
    long:
      "When auth is non-negotiable, give agents a path: a public mirror, an anonymous-read endpoint, or a documented API key the user can configure.",
  },
  "well-known-mcp-card": {
    short:
      "Publish /.well-known/mcp.json so agents can discover your MCP server.",
    long:
      "MCP-aware agents check /.well-known/mcp.json for capability metadata. Without it, even users who would benefit from your MCP server never get pointed to it.",
  },
  "well-known-agent-skills": {
    short:
      "Publish /.well-known/agent-skills.json so coding agents can discover task-specific skills.",
    long:
      "Skills are reusable agent capabilities scoped to your product. The well-known endpoint is how agents find them without manual config.",
  },
  "well-known-api-catalog": {
    short:
      "Publish /.well-known/api-catalog so agents can locate your OpenAPI/AsyncAPI specs.",
    long:
      "An api-catalog points agents at your API definitions. Without it, agents either guess paths or skip your API entirely.",
  },
  "link-header-api-catalog": {
    short:
      "Send `Link: </.well-known/api-catalog>; rel=\"api-catalog\"` on docs responses.",
    long:
      "The HTTP Link header is a lower-effort cousin of well-known endpoints. Even if you skip the file, the header tells agents where to look.",
  },
  "robots-txt": {
    short:
      "Allow major AI crawlers (GPTBot, OAI-SearchBot, ClaudeBot, PerplexityBot) in /robots.txt.",
    long:
      "If robots.txt blocks agent crawlers, you're invisible to ChatGPT, Perplexity, and Claude.ai search even if your docs are otherwise perfect.",
  },
  "content-signals": {
    short:
      "Add JSON-LD or Schema.org structured data so answer engines can cite specific sections.",
    long:
      "Answer engines like Perplexity heavily favor structured-data-rich pages because the citation surface is more reliable.",
  },
  "http-status-codes": {
    short:
      "Return the right status code. Soft 404s (200 + 'page not found' body) confuse agents.",
    long:
      "Agents trust status codes. A page that returns 200 but says 'not found' wastes the agent's budget on dead content.",
  },
  "redirect-behavior": {
    short:
      "Use 301/308 for permanent redirects, 302/307 for temporary. Avoid HTML meta-refresh.",
    long:
      "JS or meta-refresh redirects break for agents that don't render. Server-side 3xx redirects work for everyone.",
  },
  "markdown-code-fence-validity": {
    short:
      "Wrap every code block in triple backticks with a language tag (```ts, ```python).",
    long:
      "Code blocks without language tags lose their type when converted to markdown, hurting both rendering and agent parsing of examples.",
  },
  "heading-hierarchy": {
    short:
      "Use exactly one H1 per page, then H2 for sections, H3 for subsections. No level skips.",
    long:
      "Agents use heading structure to chunk pages. Skipping levels (H1 → H4) or having multiple H1s makes chunking unreliable.",
  },
  "image-alt-coverage": {
    short:
      "Add alt text to every doc image. Agents and screen readers depend on it.",
    long:
      "Diagram images without alt text are invisible to non-vision agents. Even short alts ('Architecture: API → DB → Cache') help.",
  },
  "json-code-block-validity": {
    short:
      "Make sure JSON code blocks are valid JSON. Trailing commas and comments break agent parsing.",
    long:
      "Agents often try to JSON.parse() example payloads. Invalid samples cause silent failures or fallback to text-only answers.",
  },
  "internal-link-integrity": {
    short:
      "Fix broken internal links. Agents follow them and waste fetches on 404s.",
    long:
      "Broken internal links waste agent fetch budget and cause incomplete answers when a referenced section can't be reached.",
  },
};

export function fixCopyFor(checkId: string): FixCopy | null {
  return COPY[checkId] ?? null;
}

export function allFixCopyKeys(): string[] {
  return Object.keys(COPY);
}
```

- [ ] **Step 4: Run test**

Run: `npx vitest run tests/fix/check-fix-copy.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/fix/check-fix-copy.ts tests/fix/check-fix-copy.test.ts
git commit -m "feat(fix): per-check fix copy lookup table (replaces recipe classifier)"
```

### Task 11: Build the agent-fix prompt generator (TDD)

**Files:**
- Create: `tests/fix/prompt.test.ts`
- Create: `src/lib/fix/prompt.ts`

- [ ] **Step 1: Write failing test**

Create `tests/fix/prompt.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { generateAgentFixPrompt } from "@/lib/fix/prompt";
import type { FixFinding } from "@/lib/fix/types";

const baseFinding = (overrides: Partial<FixFinding>): FixFinding => ({
  id: "llms-txt-exists",
  title: "llms.txt missing",
  severity: "fail",
  source: "check",
  evidence: "/llms.txt returned 404",
  affectedProfiles: ["rawHttp", "snippet"],
  fixHint: "create /llms.txt",
  pageUrl: "https://docs.example.com/",
  occurrences: 1,
  ...overrides,
});

describe("generateAgentFixPrompt", () => {
  it("includes URL, score, grade, failing+warning counts in header", () => {
    const out = generateAgentFixPrompt({
      siteUrl: "https://docs.example.com",
      siteName: "Example",
      score: 87,
      grade: "B",
      findings: [baseFinding({})],
    });
    expect(out).toContain("# Agent Score Fix Report — Example");
    expect(out).toContain("URL: https://docs.example.com");
    expect(out).toContain("Score: 87/100 (Grade B)");
    expect(out).toContain("1 failing checks and 0 warnings");
  });

  it("groups failures and warnings into separate sections", () => {
    const out = generateAgentFixPrompt({
      siteUrl: "https://x.com",
      siteName: "X",
      score: 70,
      grade: "C",
      findings: [
        baseFinding({ id: "llms-txt-exists", severity: "fail", title: "no llms.txt" }),
        baseFinding({ id: "metadata-completeness", severity: "warn", title: "missing meta" }),
      ],
    });
    expect(out).toContain("## Failing Checks (1)");
    expect(out).toContain("## Warnings (1)");
    expect(out.indexOf("## Failing Checks")).toBeLessThan(out.indexOf("## Warnings"));
  });

  it("includes a Common fixes block sourced from check-fix-copy", () => {
    const out = generateAgentFixPrompt({
      siteUrl: "https://x.com",
      siteName: "X",
      score: 50,
      grade: "F",
      findings: [
        baseFinding({ id: "llms-txt-exists", severity: "fail" }),
        baseFinding({ id: "content-negotiation", severity: "fail", title: "no markdown" }),
      ],
    });
    expect(out).toContain("### Common fixes:");
    expect(out).toContain("**No llms.txt**");
    expect(out).toContain("**No content negotiation**");
  });

  it("includes the npx afdocs pointer at the end", () => {
    const out = generateAgentFixPrompt({
      siteUrl: "https://x.com",
      siteName: "X",
      score: 100,
      grade: "A+",
      findings: [],
    });
    expect(out).toContain("npx afdocs check https://x.com --fixes --verbose");
  });

  it("dedupes findings by id when generating common fixes", () => {
    const out = generateAgentFixPrompt({
      siteUrl: "https://x.com",
      siteName: "X",
      score: 60,
      grade: "F",
      findings: [
        baseFinding({ id: "llms-txt-exists", pageUrl: "https://x.com/a" }),
        baseFinding({ id: "llms-txt-exists", pageUrl: "https://x.com/b" }),
      ],
    });
    const matches = out.match(/llms\.txt/gi);
    // appears in failing-checks bullet, common-fixes bullet, and label —
    // 3 occurrences max, not 4 (would mean we duplicated the common-fix entry)
    expect(matches?.length ?? 0).toBeLessThanOrEqual(3);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/fix/prompt.test.ts`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement the prompt generator**

Create `src/lib/fix/prompt.ts`:

```typescript
import type { FixFinding } from "./types";
import { fixCopyFor } from "./check-fix-copy";

export interface AgentFixPromptInput {
  siteUrl: string;
  siteName: string;
  score: number;
  grade: string;
  findings: FixFinding[];
}

/**
 * Generate the Fern-style agent-fix report. Self-contained markdown the user
 * pastes into Claude Code, Cursor, or any coding agent. Contains the score in
 * the header (the prompt is portable and needs the anchor) even though the UI
 * demotes the grade to a footer.
 */
export function generateAgentFixPrompt(input: AgentFixPromptInput): string {
  const fails = input.findings.filter((f) => f.severity === "fail");
  const warns = input.findings.filter((f) => f.severity === "warn");
  const lines: string[] = [];

  lines.push(`# Agent Score Fix Report — ${input.siteName}`);
  lines.push(`URL: ${input.siteUrl}`);
  lines.push(`Score: ${input.score}/100 (Grade ${input.grade})`);
  lines.push("");
  lines.push(
    `I need help improving the AI-readiness of the documentation at ${input.siteUrl}.`,
  );
  lines.push(
    `Docs Lens found ${fails.length} failing checks and ${warns.length} warnings.`,
  );
  lines.push("");

  lines.push(`## Failing Checks (${fails.length})`);
  for (const f of dedupeById(fails)) {
    lines.push(`- [${f.id}] ${f.title}: ${f.evidence}`);
  }
  lines.push("");

  lines.push(`## Warnings (${warns.length})`);
  for (const w of dedupeById(warns)) {
    lines.push(`- [${w.id}] ${w.title}: ${w.evidence}`);
  }
  lines.push("");

  lines.push("## Fix Instructions");
  lines.push("");
  lines.push("For each issue above, please:");
  lines.push(`1. Analyze the documentation site at ${input.siteUrl}`);
  lines.push(`2. Implement the specific fix`);
  lines.push(`3. Verify the fix would cause the check to pass`);
  lines.push("");

  const uniqueIds = uniqueIdsOf(input.findings);
  if (uniqueIds.length > 0) {
    lines.push("### Common fixes:");
    for (const id of uniqueIds) {
      const copy = fixCopyFor(id);
      if (copy) lines.push(`- **${humanLabel(id)}**: ${copy.short}`);
    }
    lines.push("");
  }

  lines.push("## Run afdocs Locally for More Detail");
  lines.push("");
  lines.push("To get deeper visibility into what's failing, run afdocs against your docs:");
  lines.push("");
  lines.push("```");
  lines.push(`  npx afdocs check ${input.siteUrl} --fixes --verbose`);
  lines.push("```");
  lines.push("");
  lines.push("- **--fixes**: Adds 'Fix:' lines to the output for each warn/fail check with actionable remediation steps");
  lines.push("- **-v, --verbose**: Shows per-page details (specific URLs, character counts, error codes)");

  return lines.join("\n");
}

function dedupeById(findings: FixFinding[]): FixFinding[] {
  const seen = new Set<string>();
  const out: FixFinding[] = [];
  for (const f of findings) {
    if (seen.has(f.id)) continue;
    seen.add(f.id);
    out.push(f);
  }
  return out;
}

function uniqueIdsOf(findings: FixFinding[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const f of findings) {
    if (seen.has(f.id)) continue;
    seen.add(f.id);
    out.push(f.id);
  }
  return out;
}

/** Human-readable label for the "Common fixes" bullet, e.g. "No llms.txt". */
function humanLabel(checkId: string): string {
  const map: Record<string, string> = {
    "llms-txt-exists": "No llms.txt",
    "llms-txt-valid": "Invalid llms.txt",
    "llms-txt-directive": "No llms.txt directive",
    "llms-txt-links-resolve": "Broken llms.txt links",
    "llms-txt-links-markdown": "llms.txt links to HTML, not markdown",
    "markdown-url-support": "No .md URL support",
    "content-negotiation": "No content negotiation",
    "rendering-strategy": "Client-side rendering only",
    "page-size-html": "HTML too large",
    "page-size-markdown": "Markdown too large",
    "content-start-position": "Content starts too late",
    "tabbed-content-serialization": "Tabs hidden behind JS",
    "metadata-completeness": "Missing meta tags",
    "auth-gate-detection": "Auth wall on docs",
    "auth-alternative-access": "No public access path",
    "well-known-mcp-card": "No MCP card",
    "well-known-agent-skills": "No agent skills card",
    "well-known-api-catalog": "No API catalog",
    "link-header-api-catalog": "No api-catalog Link header",
    "robots-txt": "Bots blocked in robots.txt",
    "content-signals": "Missing structured data",
    "http-status-codes": "Wrong status codes",
    "redirect-behavior": "Bad redirects",
    "markdown-code-fence-validity": "Code blocks without language tag",
    "heading-hierarchy": "Heading hierarchy issues",
    "image-alt-coverage": "Missing alt text",
    "json-code-block-validity": "Invalid JSON examples",
    "internal-link-integrity": "Broken internal links",
  };
  return map[checkId] ?? checkId;
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/fix/prompt.test.ts`
Expected: PASS, 5 tests

- [ ] **Step 5: Commit**

```bash
git add src/lib/fix/prompt.ts tests/fix/prompt.test.ts
git commit -m "feat(fix): agent-fix prompt generator (Fern-style report, copyable)"
```

---

## Phase G — Cap reduction

### Task 12: Lower crawl cap from 1000 to 50, default to 10

**Files:**
- Modify: `src/app/api/scan/route.ts`
- Modify: `src/app/page.tsx`
- Modify: `src/lib/core/runner.ts:117` (default cap inside `scanSite`)

- [ ] **Step 1: Update API route caps**

Read `src/app/api/scan/route.ts`. Find the cap clamp (likely `Math.min(1000, ...)` or `MAX_CAP`). Replace with `50` upper bound and `10` default.

- [ ] **Step 2: Update homepage caps**

Edit `src/app/page.tsx`:

```typescript
const DEFAULT_CAP = 10;
const MAX_CAP = 50;
```

- [ ] **Step 3: Update runner default**

Edit `src/lib/core/runner.ts` — change `const cap = config.cap ?? 250;` to `const cap = config.cap ?? 10;`.

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/api/scan/route.ts src/app/page.tsx src/lib/core/runner.ts
git commit -m "refactor(scan): lower default cap to 10, max 50 — small samples by design"
```

---

## Phase H — Homepage rebuild

### Task 13: Rewrite homepage with static demo

**Files:**
- Modify: `src/app/page.tsx` (entire file)
- Create: `src/components/HomepageDemo.tsx`

- [ ] **Step 1: Build the static demo component**

Create `src/components/HomepageDemo.tsx`:

```tsx
"use client";

import { useState } from "react";

const SAMPLE = {
  rendered: {
    title: "Charges API",
    body: "The Charges resource lets you accept payments. Authenticate with your API key, then POST to /v1/charges with amount, currency, and source.",
  },
  rawHttp: `Title: Charges API · Stripe
Description: Create, retrieve, and refund charges.

# Charges API

The Charges resource lets you accept payments...

(markdown was truncated at 100 KB by Claude Code's WebFetch pipeline)`,
  headless: `# Charges API

The Charges resource lets you accept payments. Authenticate with your API key, then POST to /v1/charges with amount, currency, and source.

[Try it →]
[See response shape →]
[Edit on GitHub →]

(full DOM after JS execution; ~12 KB markdown)`,
  snippet: `Title: Charges API · Stripe
Description: Create, retrieve, and refund charges.
og:title: Charges API
og:description: Stripe Charges reference.
og:image: https://stripe.com/og.png
First H1: Charges API

Preview (200 chars):
The Charges resource lets you accept payments. Authenticate with your API key, then POST to /v1/charges with amount, currency, and source.`,
};

const TABS: Array<{
  id: keyof typeof SAMPLE & ("rawHttp" | "headless" | "snippet");
  label: string;
  who: string;
}> = [
  { id: "rawHttp", label: "Raw HTTP", who: "Claude Code · Cursor · Continue" },
  { id: "headless", label: "Headless browser", who: "ChatGPT Atlas · Perplexity Comet · Cline" },
  { id: "snippet", label: "Search snippet", who: "ChatGPT Search · Perplexity · You.com" },
];

export function HomepageDemo() {
  const [active, setActive] = useState<typeof TABS[number]["id"]>("rawHttp");

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-12 max-w-4xl mx-auto text-left">
      <div className="border border-rule rounded-lg p-4 bg-paper-dim/30">
        <div className="text-[11px] uppercase tracking-wide text-ink/50 mb-2">
          What you see
        </div>
        <div className="font-bold text-lg mb-2">{SAMPLE.rendered.title}</div>
        <p className="text-[14px] text-ink/80 leading-relaxed">{SAMPLE.rendered.body}</p>
        <div className="mt-3 flex gap-2 text-[11px] text-ink/50">
          <span>[Try it]</span>
          <span>[See response]</span>
          <span>[Edit on GitHub]</span>
        </div>
      </div>
      <div className="border border-rule rounded-lg bg-paper-dim/30 overflow-hidden">
        <div className="flex border-b border-rule">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActive(t.id)}
              className={`flex-1 px-3 py-2 text-[12px] font-medium border-r border-rule last:border-r-0 ${
                active === t.id ? "bg-paper text-ink" : "text-ink/60 hover:text-ink"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="p-4">
          <div className="text-[11px] uppercase tracking-wide text-ink/50 mb-2">
            What {TABS.find((t) => t.id === active)?.who} see
          </div>
          <pre className="whitespace-pre-wrap text-[12px] text-ink/80 leading-relaxed font-mono">
            {SAMPLE[active]}
          </pre>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Replace src/app/page.tsx**

Replace `src/app/page.tsx` with:

```tsx
"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { HomepageDemo } from "@/components/HomepageDemo";

const DEFAULT_CAP = 10;
const MAX_CAP = 50;

export default function Page() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [cap, setCap] = useState(DEFAULT_CAP);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = url.trim();
      if (!trimmed) return;
      try {
        new URL(trimmed);
      } catch {
        setError("Not a valid URL — include the protocol, e.g. https://docs.stripe.com/api");
        return;
      }
      const safeCap = Math.max(1, Math.min(MAX_CAP, Math.round(cap) || DEFAULT_CAP));
      setError(null);
      setSubmitting(true);
      try {
        const res = await fetch("/api/scan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: trimmed, cap: safeCap }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          setError(body.error ?? `scan failed (${res.status})`);
          setSubmitting(false);
          return;
        }
        const { id } = (await res.json()) as { id: string };
        router.push(`/scan/${encodeURIComponent(id)}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "scan failed");
        setSubmitting(false);
      }
    },
    [url, cap, router],
  );

  return (
    <div className="min-h-screen flex flex-col bg-paper">
      <section className="bg-paper-dim/50 border-b border-rule">
        <div className="max-w-[1200px] mx-auto px-6 py-3 flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2.5">
            <span className="text-[15px] font-bold tracking-tight h-navy">Docs Lens</span>
            <span className="hidden lg:inline text-[11.5px] text-ink/50 ml-1">
              see what every agent reader gets
            </span>
          </div>
          <div className="flex items-center gap-1.5 ml-auto">
            <Link href="/methodology" className="nav-link hidden sm:inline">
              Methodology
            </Link>
          </div>
        </div>
      </section>

      <main className="flex-1 flex flex-col items-center justify-center px-6 py-16">
        <div className="text-center max-w-3xl w-full">
          <h1 className="h-display h-navy text-[44px] md:text-[60px] leading-[1.02] mb-5">
            See what every agent reader gets when it visits your docs.
          </h1>
          <p className="text-[16px] text-ink/70 mb-8 max-w-2xl mx-auto">
            Three readers — raw HTTP fetchers, headless browsers, search-snippet consumers — each
            tied to real products. Pick a docs URL. We'll show you the gap, explain why it
            matters, and hand you a prompt to fix it.
          </p>
          <form onSubmit={submit} className="flex flex-col sm:flex-row gap-2 max-w-xl mx-auto">
            <input
              type="text"
              inputMode="url"
              placeholder="https://docs.example.com"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="flex-1 input"
              disabled={submitting}
            />
            <input
              type="number"
              min={1}
              max={MAX_CAP}
              value={cap}
              onChange={(e) => setCap(Number(e.target.value))}
              className="w-20 input"
              disabled={submitting}
              aria-label="page cap"
            />
            <button type="submit" className="btn-primary" disabled={submitting}>
              {submitting ? "Starting…" : "Scan"}
            </button>
          </form>
          {error && <p className="mt-3 text-[12.5px] text-[color:var(--color-fail-ring)]">{error}</p>}
          <p className="mt-3 text-[11.5px] text-ink/50">
            Cap is {DEFAULT_CAP} pages by default · max {MAX_CAP}. Free, no signup.
          </p>
        </div>

        <HomepageDemo />
      </main>

      <footer className="border-t border-rule py-6 px-6 text-center text-[11.5px] text-ink/50">
        Docs Lens · educational tool by EkLine ·{" "}
        <Link href="/methodology" className="underline">
          methodology
        </Link>
      </footer>
    </div>
  );
}
```

- [ ] **Step 3: Build and visually verify**

Run: `npm run build && npm run dev`
Open `http://localhost:3000` — confirm:
- Hero copy reads correctly
- The two-column demo renders, tabs switch
- The form submits to a scan

- [ ] **Step 4: Commit**

```bash
git add src/app/page.tsx src/components/HomepageDemo.tsx
git commit -m "feat(home): rebuild homepage — verdict-first hero + 2-col tabbed demo"
```

---

## Phase I — Scan summary page rebuild

### Task 14: Build SiteVerdict component

**Files:**
- Create: `src/components/scan/SiteVerdict.tsx`

- [ ] **Step 1: Implement the component**

Create `src/components/scan/SiteVerdict.tsx`:

```tsx
import type { SiteStats } from "@/lib/core/run-types";
import type { ProfileId } from "@/lib/core/types";

type Status = "good" | "partial" | "broken";

const PROFILE_LABELS: Record<ProfileId, string> = {
  rawHttp: "Raw HTTP fetchers",
  headless: "Headless browsers",
  snippet: "Search snippets",
};

interface Props {
  perProfile: Record<ProfileId, Status>;
}

export function SiteVerdict({ perProfile }: Props) {
  const sentence = buildSentence(perProfile);
  return (
    <section className="px-6 py-8 border-b border-rule">
      <div className="max-w-[1100px] mx-auto">
        <h2 className="text-[22px] md:text-[28px] leading-snug h-navy max-w-3xl">{sentence}</h2>
      </div>
    </section>
  );
}

function buildSentence(perProfile: Record<ProfileId, Status>): string {
  const phrase = (id: ProfileId, s: Status): string => {
    const subj = PROFILE_LABELS[id];
    if (s === "good") return `${subj} get all your content`;
    if (s === "partial") return `${subj} miss part of it`;
    return `${subj} can't read it at all`;
  };
  const parts = (Object.entries(perProfile) as [ProfileId, Status][]).map(([id, s]) =>
    phrase(id, s),
  );
  if (parts.length === 0) return "Scanning your site…";
  if (parts.length === 1) return `${capitalize(parts[0]!)}.`;
  return `${capitalize(parts[0]!)}. ${parts.slice(1).map(capitalize).join(". ")}.`;
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0]!.toUpperCase() + s.slice(1);
}

export function deriveStatuses(stats: SiteStats | null): Record<ProfileId, Status> {
  if (!stats) return { rawHttp: "broken", headless: "broken", snippet: "broken" };
  const totals = stats.avgTokensClaudePerProfile;
  const headless = totals.headless ?? 0;
  const result: Record<ProfileId, Status> = { rawHttp: "broken", headless: "broken", snippet: "broken" };
  for (const id of ["rawHttp", "headless", "snippet"] as const) {
    const t = totals[id] ?? 0;
    if (t === 0) result[id] = "broken";
    else if (headless > 0 && t / headless < 0.5) result[id] = "partial";
    else result[id] = "good";
  }
  return result;
}
```

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/components/scan/SiteVerdict.tsx
git commit -m "feat(scan): SiteVerdict component — one-sentence headline from profile statuses"
```

### Task 15: Build ProfileStatusCards and ProfileExplainerCards

**Files:**
- Create: `src/components/scan/ProfileStatusCards.tsx`
- Create: `src/components/scan/ProfileExplainerCards.tsx`

- [ ] **Step 1: Implement ProfileStatusCards**

Create `src/components/scan/ProfileStatusCards.tsx`:

```tsx
import type { ProfileId } from "@/lib/core/types";

type Status = "good" | "partial" | "broken";

interface Props {
  perProfile: Record<ProfileId, Status>;
  findingCounts: Record<ProfileId, number>;
}

const LABELS: Record<ProfileId, { title: string; consumers: string }> = {
  rawHttp: {
    title: "Raw HTTP",
    consumers: "Claude Code · Cursor · Continue · Aider (default)",
  },
  headless: {
    title: "Headless browser",
    consumers: "ChatGPT Atlas · Perplexity Comet · Cline · Roo Code",
  },
  snippet: {
    title: "Search snippet",
    consumers: "ChatGPT Search · Perplexity · You.com · Phind",
  },
};

const STATUS_COLOR: Record<Status, string> = {
  good: "bg-emerald-500",
  partial: "bg-amber-500",
  broken: "bg-rose-500",
};

const STATUS_LABEL: Record<Status, string> = {
  good: "Good",
  partial: "Partial",
  broken: "Broken",
};

export function ProfileStatusCards({ perProfile, findingCounts }: Props) {
  return (
    <section className="px-6 py-6 border-b border-rule">
      <div className="max-w-[1100px] mx-auto grid grid-cols-1 md:grid-cols-3 gap-4">
        {(["rawHttp", "headless", "snippet"] as const).map((id) => {
          const status = perProfile[id];
          const count = findingCounts[id] ?? 0;
          return (
            <div key={id} className="border border-rule rounded-lg p-4 bg-paper-dim/30">
              <div className="flex items-center gap-2 mb-1">
                <span className={`w-2 h-2 rounded-full ${STATUS_COLOR[status]}`} />
                <span className="font-semibold">{LABELS[id].title}</span>
                <span className="ml-auto text-[11px] uppercase text-ink/50">
                  {STATUS_LABEL[status]}
                </span>
              </div>
              <p className="text-[11.5px] text-ink/60 mb-2">{LABELS[id].consumers}</p>
              <p className="text-[12.5px] text-ink/80">
                {count === 0
                  ? "No findings affect this reader."
                  : `${count} finding${count === 1 ? "" : "s"} affecting this reader.`}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Implement ProfileExplainerCards**

Create `src/components/scan/ProfileExplainerCards.tsx`:

```tsx
const CARDS = [
  {
    id: "rawHttp",
    title: "What is Raw HTTP?",
    body: "A bare HTTP fetch with no JavaScript execution. Most coding agents work this way — they pull your HTML, strip <style> and <script> tags, and convert what's left to markdown. Claude Code's WebFetch is the canonical example.",
    citation: "Claude Code v2.1.105 changelog: 'WebFetch strips <style> and <script> contents from fetched pages.'",
    citationUrl:
      "https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md",
  },
  {
    id: "headless",
    title: "What is a headless browser?",
    body: "A full Chromium instance that runs your JavaScript and renders CSS before reading content. ChatGPT Atlas, Perplexity Comet, Cline, and Roo Code all work this way. Modern Bingbot and Googlebot also render via WRS.",
    citation: "Perplexity Comet uses Chromium; Cline uses Puppeteer; Atlas runs OpenAI's OWL Chromium layer.",
    citationUrl: "https://comet-help.perplexity.ai/en/articles/11583798-what-is-comet-s-browser-engine",
  },
  {
    id: "snippet",
    title: "What is a search snippet?",
    body: "Some agents never see your full page — they receive a ranked snippet (title, meta description, OG tags, first paragraphs). Decisions get made on metadata. ChatGPT Search, Perplexity declared bot, You.com, and Anthropic's web_search tool all work this way.",
    citation: "Anthropic's web_search returns snippets only; full pages require web_fetch.",
    citationUrl: "https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool",
  },
];

export function ProfileExplainerCards() {
  return (
    <section className="px-6 py-8 border-b border-rule bg-paper-dim/40">
      <div className="max-w-[1100px] mx-auto">
        <h3 className="text-[15px] font-semibold mb-4 text-ink/80">
          Three reader populations, three real-world groups of agent products.
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {CARDS.map((c) => (
            <div key={c.id} className="border border-rule rounded-lg p-4 bg-paper">
              <h4 className="font-semibold mb-2">{c.title}</h4>
              <p className="text-[13px] text-ink/80 leading-relaxed mb-3">{c.body}</p>
              <a
                href={c.citationUrl}
                target="_blank"
                rel="noreferrer"
                className="text-[11px] text-ink/50 italic hover:text-ink/80"
              >
                {c.citation}
              </a>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/components/scan/ProfileStatusCards.tsx src/components/scan/ProfileExplainerCards.tsx
git commit -m "feat(scan): ProfileStatusCards + ProfileExplainerCards"
```

### Task 16: Build AgentFixPrompt component and GradeFooter

**Files:**
- Create: `src/components/scan/AgentFixPrompt.tsx`
- Create: `src/components/scan/GradeFooter.tsx`

- [ ] **Step 1: Implement AgentFixPrompt**

Create `src/components/scan/AgentFixPrompt.tsx`:

```tsx
"use client";

import { useState } from "react";

interface Props {
  prompt: string;
}

export function AgentFixPrompt({ prompt }: Props) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section className="px-6 py-8 border-b border-rule">
      <div className="max-w-[1100px] mx-auto">
        <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
          <div>
            <h3 className="text-[15px] font-semibold text-ink/90">Hand this to your agent</h3>
            <p className="text-[12.5px] text-ink/60 mt-1">
              Paste into Claude Code, Cursor, or any coding agent. The prompt names the failing
              checks and explains the fix for each.
            </p>
          </div>
          <button
            type="button"
            onClick={copy}
            className="btn-primary"
          >
            {copied ? "Copied" : "Copy prompt"}
          </button>
        </div>
        <pre className="border border-rule rounded-lg bg-paper-dim/50 p-4 overflow-x-auto text-[12px] leading-relaxed font-mono whitespace-pre-wrap">
          {prompt}
        </pre>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Implement GradeFooter**

Create `src/components/scan/GradeFooter.tsx`:

```tsx
interface Props {
  score: number;
  grade: string;
  scanUrl: string;
}

export function GradeFooter({ score, grade, scanUrl }: Props) {
  const share = () => {
    if (navigator.share) {
      navigator.share({ url: scanUrl, title: `Docs Lens — Grade ${grade}` }).catch(() => {});
    } else {
      navigator.clipboard.writeText(scanUrl);
    }
  };
  return (
    <footer className="px-6 py-6 text-center">
      <div className="max-w-[1100px] mx-auto text-[12px] text-ink/50">
        If you need a number to share: this scan would grade as{" "}
        <span className="text-ink/80 font-medium">
          {grade} ({score}/100)
        </span>
        .{" "}
        <button type="button" onClick={share} className="underline ml-2">
          share
        </button>
      </div>
    </footer>
  );
}
```

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/components/scan/AgentFixPrompt.tsx src/components/scan/GradeFooter.tsx
git commit -m "feat(scan): AgentFixPrompt copy block + footer-level GradeFooter"
```

### Task 17: Restructure scan summary page

**Files:**
- Modify: `src/app/scan/[id]/page.tsx` (entire file)
- Modify: `src/hooks/useScanRun.ts` (verify it exposes `result.score`/`result.grade` — see step 1)

- [ ] **Step 1: Read the hook to confirm the API**

Read `src/hooks/useScanRun.ts`. The returned state should have `siteStats`, `fixes`, `result.config.rootUrl`, status, etc. If `score` and `grade` aren't on the state, compute them in the page from `state.fixes` using `computeScore` from `src/lib/scoring.ts`.

- [ ] **Step 2: Replace src/app/scan/[id]/page.tsx**

Replace contents:

```tsx
"use client";

import { useMemo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useScanRun } from "@/hooks/useScanRun";
import { ScanProgress } from "@/components/scan/ScanProgress";
import { ScanHeader } from "@/components/scan/ScanHeader";
import { SiteVerdict, deriveStatuses } from "@/components/scan/SiteVerdict";
import { ProfileStatusCards } from "@/components/scan/ProfileStatusCards";
import { ProfileExplainerCards } from "@/components/scan/ProfileExplainerCards";
import { AgentFixPrompt } from "@/components/scan/AgentFixPrompt";
import { GradeFooter } from "@/components/scan/GradeFooter";
import { PageMatrix } from "@/components/scan/PageMatrix";
import { FixList } from "@/components/scan/FixList";
import { generateAgentFixPrompt } from "@/lib/fix/prompt";
import type { ProfileId } from "@/lib/core/types";

function gradeFor(score: number): string {
  if (score === 100) return "A+";
  if (score >= 97) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 61) return "D";
  return "F";
}

function computeScoreFromFindings(findingsCount: { fail: number; warn: number }): number {
  // Linear: each fail -7, each warn -3, floor 0.
  return Math.max(0, 100 - findingsCount.fail * 7 - findingsCount.warn * 3);
}

export default function ScanPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? null;
  const state = useScanRun(id);

  const ready = state.status === "done" || state.status === "stopped";

  const perProfile = useMemo(() => deriveStatuses(state.siteStats ?? null), [state.siteStats]);
  const findingCounts = useMemo(() => {
    const counts: Record<ProfileId, number> = { rawHttp: 0, headless: 0, snippet: 0 };
    for (const f of state.fixes) {
      if (f.affectedProfiles === "general") continue;
      for (const p of f.affectedProfiles) counts[p] = (counts[p] ?? 0) + 1;
    }
    return counts;
  }, [state.fixes]);

  const score = useMemo(() => {
    const fail = state.fixes.filter((f) => f.severity === "fail").length;
    const warn = state.fixes.filter((f) => f.severity === "warn").length;
    return computeScoreFromFindings({ fail, warn });
  }, [state.fixes]);
  const grade = gradeFor(score);

  const rootUrl = state.result?.config.rootUrl ?? "";
  const promptText = useMemo(() => {
    if (!ready || !rootUrl) return "";
    return generateAgentFixPrompt({
      siteUrl: rootUrl,
      siteName: hostnameOf(rootUrl),
      score,
      grade,
      findings: state.fixes,
    });
  }, [ready, rootUrl, score, grade, state.fixes]);

  const shareUrl = typeof window !== "undefined" ? window.location.href : "";

  return (
    <div className="min-h-screen flex flex-col bg-paper">
      <ScanHeader state={state} />
      <ScanProgress state={state} runId={id} />
      <main className="flex-1 flex flex-col">
        {ready ? (
          <>
            <SiteVerdict perProfile={perProfile} />
            <ProfileStatusCards perProfile={perProfile} findingCounts={findingCounts} />
            <PageMatrix pages={state.pages} runId={id ?? ""} />
            <FixList fixes={state.fixes} loading={false} />
            <AgentFixPrompt prompt={promptText} />
            <ProfileExplainerCards />
            <GradeFooter score={score} grade={grade} scanUrl={shareUrl} />
          </>
        ) : (
          <div className="px-6 py-12 text-center text-ink/60">
            <p className="text-[14px]">Scanning… this typically takes 20-60 seconds.</p>
          </div>
        )}
      </main>
      <footer className="border-t border-rule py-4 px-6 text-center text-[11px] text-ink/40">
        <Link href="/methodology" className="underline">
          methodology
        </Link>{" "}
        · educational tool by EkLine
      </footer>
    </div>
  );
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}
```

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: PASS. If `FixList` or `PageMatrix` reference dropped types (`audience`, `axis`, `recipe`), patch them inline — keep the visual output minimal but the types must compile.

- [ ] **Step 4: Manually walk a scan**

Run: `npm run dev`. Paste a docs URL, watch the scan complete, confirm:
- The verdict sentence renders
- Three status cards render with profiles + counts
- The page matrix shows pages
- The fix list shows findings
- The agent fix prompt block renders, copy button works
- The explainer cards render at the bottom
- The grade footer is small, at the very bottom

- [ ] **Step 5: Commit**

```bash
git add src/app/scan/[id]/page.tsx
git commit -m "feat(scan): rebuild scan summary — verdict-first layout, agent-fix prompt, grade footer"
```

---

## Phase J — Page drilldown two-column rebuild

### Task 18: Build PageDrilldownTwoColumn

**Files:**
- Create: `src/components/scan/PageDrilldownTwoColumn.tsx`
- Modify: `src/app/scan/[id]/page/[pageIndex]/page.tsx`

- [ ] **Step 1: Implement the two-column component**

Create `src/components/scan/PageDrilldownTwoColumn.tsx`:

```tsx
"use client";

import { useState } from "react";
import type { PageResult } from "@/lib/core/run-types";
import type { ProfileId } from "@/lib/core/types";

type TabId = "rawHttp" | "headless" | "snippet";

const TABS: Array<{ id: TabId; label: string; who: string }> = [
  { id: "rawHttp", label: "Raw HTTP", who: "Claude Code · Cursor · Continue · Aider" },
  { id: "headless", label: "Headless browser", who: "Atlas · Comet · Cline · Roo Code" },
  { id: "snippet", label: "Search snippet", who: "ChatGPT Search · Perplexity · You.com" },
];

interface Props {
  page: PageResult;
}

export function PageDrilldownTwoColumn({ page }: Props) {
  const [active, setActive] = useState<TabId>("rawHttp");

  const rawChars = page.profiles.rawHttp?.chars ?? 0;
  const headlessChars = page.profiles.headless?.chars ?? 0;
  const divergencePct =
    headlessChars > 0
      ? Math.max(0, Math.min(100, Math.round(((headlessChars - rawChars) / headlessChars) * 100)))
      : 0;

  const showDivergence = divergencePct >= 30;

  const md = page.profiles[active]?.markdown ?? "(no output for this profile)";

  return (
    <section className="px-6 py-8">
      <div className="max-w-[1300px] mx-auto">
        {showDivergence && (
          <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-[12.5px] text-amber-900">
            ⚠️ Raw HTTP saw {100 - divergencePct}% of what Headless saw on this page. The missing{" "}
            {divergencePct}% is rendered by JavaScript that Raw HTTP doesn't execute.
          </div>
        )}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="border border-rule rounded-lg overflow-hidden bg-paper-dim/30">
            <div className="px-4 py-2 border-b border-rule text-[11.5px] uppercase tracking-wide text-ink/60">
              What you see
            </div>
            <iframe
              src={page.url}
              title={page.url}
              className="w-full h-[600px] bg-white"
              sandbox="allow-same-origin"
            />
          </div>
          <div className="border border-rule rounded-lg overflow-hidden bg-paper-dim/30">
            <div className="flex border-b border-rule">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setActive(t.id)}
                  className={`flex-1 px-3 py-2 text-[12px] font-medium border-r border-rule last:border-r-0 ${
                    active === t.id ? "bg-paper text-ink" : "text-ink/60 hover:text-ink"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <div className="px-4 py-2 border-b border-rule text-[11.5px] uppercase tracking-wide text-ink/60">
              What {TABS.find((t) => t.id === active)?.who} see ·{" "}
              {(page.profiles[active]?.chars ?? 0).toLocaleString()} chars
            </div>
            <pre className="p-4 whitespace-pre-wrap text-[12px] leading-relaxed font-mono h-[540px] overflow-y-auto">
              {md}
            </pre>
          </div>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Update the page route**

Read `src/app/scan/[id]/page/[pageIndex]/page.tsx` to see the current shape. Modify it so the main content is the new two-column component plus the per-page findings list. Strip imports of any deleted components.

Skeleton:

```tsx
"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { useScanRun } from "@/hooks/useScanRun";
import { PageDrilldownTwoColumn } from "@/components/scan/PageDrilldownTwoColumn";
import { FixList } from "@/components/scan/FixList";

export default function PageDrilldown() {
  const params = useParams<{ id: string; pageIndex: string }>();
  const id = params?.id ?? null;
  const pageIndex = Number(params?.pageIndex ?? 0);
  const state = useScanRun(id);

  const page = state.pages[pageIndex];
  const pageFindings = state.fixes.filter((f) => f.pageUrl === page?.url);

  return (
    <div className="min-h-screen bg-paper">
      <header className="px-6 py-3 border-b border-rule">
        <Link href={`/scan/${id}`} className="text-[12.5px] underline">
          ← back to scan
        </Link>
        <h1 className="mt-2 text-[18px] font-semibold truncate max-w-2xl">{page?.url ?? "Loading…"}</h1>
      </header>
      {page && <PageDrilldownTwoColumn page={page} />}
      <FixList fixes={pageFindings} loading={false} />
    </div>
  );
}
```

- [ ] **Step 3: Build and visually verify**

Run: `npm run build && npm run dev`. After a scan, click into a page row from the matrix. Confirm:
- Two-column layout: iframe on left, tabs on right
- Tabs switch between rawHttp / headless / snippet output
- Divergence callout appears when applicable
- Per-page findings list renders below

- [ ] **Step 4: Commit**

```bash
git add src/components/scan/PageDrilldownTwoColumn.tsx src/app/scan/[id]/page/[pageIndex]/page.tsx
git commit -m "feat(drilldown): two-column page view (iframe + tabbed agent reads) + divergence callout"
```

---

## Phase K — Methodology page rewrite

### Task 19: Replace methodology page

**Files:**
- Modify: `src/app/methodology/page.tsx` (entire file)

- [ ] **Step 1: Replace contents**

```tsx
import Link from "next/link";

export default function MethodologyPage() {
  return (
    <div className="min-h-screen bg-paper">
      <header className="px-6 py-3 border-b border-rule">
        <Link href="/" className="text-[12.5px] underline">
          ← Docs Lens
        </Link>
      </header>
      <main className="max-w-[800px] mx-auto px-6 py-12 prose prose-neutral">
        <h1>Methodology</h1>

        <h2>The three reader profiles</h2>
        <p>
          Docs Lens runs every page through three independent readers, chosen to represent the
          three populations of agent products that fetch web content.
        </p>

        <h3>Raw HTTP fetcher</h3>
        <p>
          A bare <code>GET</code> with no JavaScript execution. The HTML is run through Turndown to
          produce markdown, and <code>&lt;style&gt;</code> / <code>&lt;script&gt;</code> tags are stripped
          before extraction. This is what the following agents see:
        </p>
        <ul>
          <li>
            <strong>Claude Code WebFetch</strong> —{" "}
            <a href="https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md">
              v2.1.105 changelog
            </a>{" "}
            confirms style/script stripping plus a 100KB markdown char cap.
          </li>
          <li>
            <strong>Anthropic API <code>web_fetch</code> tool</strong> — server-side raw HTTP.
          </li>
          <li>
            <strong>Continue.dev</strong> — <code>HttpContextProvider.ts</code> uses plain HTTP +
            markdown conversion.
          </li>
          <li>
            <strong>Aider</strong> (without Playwright installed) — <code>httpx</code> fallback.
          </li>
        </ul>

        <h3>Headless browser</h3>
        <p>
          Full Chromium, full JavaScript and CSS execution. Reads the post-render DOM. In local
          development we run Playwright; in hosted deployments we proxy through{" "}
          <a href="https://github.com/jina-ai/reader">Jina Reader</a> (Puppeteer + Chrome under the
          hood). Real consumers:
        </p>
        <ul>
          <li>
            <strong>ChatGPT Atlas</strong> — Chromium via OpenAI's OWL layer.
          </li>
          <li>
            <strong>Perplexity Comet</strong> — Chromium-based browser.
          </li>
          <li>
            <strong>Cline</strong> and <strong>Roo Code</strong> — Puppeteer-based browser tool.
          </li>
          <li>
            <strong>Aider</strong> with Playwright installed.
          </li>
          <li>
            <strong>Modern Bingbot / Googlebot WRS</strong> — index-side renderer used by Bing
            Chat, Microsoft Copilot, GitHub Copilot Chat web grounding, and Gemini URL context.
            Same render pipeline, but the agent reads what was indexed last week, not what's on
            your page right now.
          </li>
        </ul>

        <h3>Search snippet</h3>
        <p>
          Never fetches the full page. Receives a ranked snippet — title, meta description, OG
          tags, first H1, the first ~200 characters of visible text, and any JSON-LD. Consumers:
        </p>
        <ul>
          <li>
            <strong>ChatGPT Search</strong> (Bing-grounded snippets)
          </li>
          <li>
            <strong>Anthropic API <code>web_search</code></strong> (Brave-backed snippets)
          </li>
          <li>
            <strong>Perplexity</strong> declared bot
          </li>
          <li>
            <strong>Cursor <code>@web</code></strong> and <code>@docs</code> — chunked-and-embedded crawl
          </li>
          <li>
            <strong>Phind</strong>, <strong>You.com</strong>, <strong>GitHub Copilot Chat</strong>{" "}
            web grounding
          </li>
        </ul>

        <h2>What we check</h2>
        <p>
          Deterministic checks only. No LLMs in the scoring path. Every check is implemented in{" "}
          <code>src/lib/checks/</code> and re-runnable by hand against your URL.
        </p>
        <p>
          Categories: discoverability (llms.txt, sitemaps, well-known endpoints), content
          accessibility (auth gates, redirects, status codes), page size and truncation, content
          structure (headings, code fences, tables, links), URL stability, observability, and
          metadata completeness.
        </p>

        <h2>What we don't measure</h2>
        <p>
          We don't lint your prose. Whether your sentences are too long or your tone is too
          passive doesn't change whether an agent can read the page. Tools like{" "}
          <a href="https://vale.sh">Vale</a> and{" "}
          <a href="https://alexjs.com">alex</a> exist for that. We also don't run lighthouse
          audits, accessibility audits beyond what's directly relevant to agent extraction, or SEO
          checks beyond the metadata that snippet readers consume.
        </p>

        <h2>The grade</h2>
        <p>
          Every scan can produce a 0-100 score and a letter grade. We deliberately demote it to a
          footer-level affordance — it exists for shareability, not for headline. The headline of
          your scan is the one-sentence verdict, not a number. The number is in the agent-fix
          prompt because the prompt has to be self-contained when pasted elsewhere.
        </p>

        <h2>Open source</h2>
        <p>
          The whole scoring path is open. Run <code>npx afdocs check &lt;url&gt; --fixes --verbose</code> for
          a deeper local report.
        </p>
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/app/methodology/page.tsx
git commit -m "docs(methodology): rewrite page — three profiles with citations, smaller scope"
```

---

## Phase L — Final verification

### Task 20: Full verification pass

- [ ] **Step 1: Run typecheck**

Run: `npx tsc --noEmit`
Expected: PASS, zero errors.

- [ ] **Step 2: Run all tests**

Run: `npx vitest run`
Expected: All tests pass. If any tests reference deleted code (e.g., axes, recipes, prose), they should already be deleted in earlier phases. If a test still imports from a deleted path, delete the test.

- [ ] **Step 3: Run build**

Run: `npm run build`
Expected: PASS, zero warnings related to dropped imports.

- [ ] **Step 4: Manual e2e flow**

Run: `npm run dev` (with `HEADLESS_BACKEND=playwright`):
- Paste a real docs URL (e.g. `https://docs.ekline.io/`)
- Confirm scan completes
- Confirm verdict, status cards, page matrix, fix list, agent-fix prompt, explainer cards, grade footer all render
- Click a page row → confirm two-column drilldown with tabs works
- Copy the agent-fix prompt → paste into a text editor → confirm it's well-formed markdown

- [ ] **Step 5: Manual hosted-mode smoke**

Run: `HEADLESS_BACKEND=jina npm run dev`. Run a scan. Confirm headless results come from Jina (the rawArtifact will be markdown, not HTML).

- [ ] **Step 6: Measure LOC reduction**

Run:
```bash
find src -type f \( -name '*.ts' -o -name '*.tsx' \) | xargs wc -l | tail -1
```
Expected: total under 7,000 lines (down from ~11,600). Note the result.

- [ ] **Step 7: Final commit**

```bash
git commit --allow-empty -m "chore: docs-lens v2 prune-and-teach complete"
```

---

## Done

The implementation is complete when all checkboxes above are marked. The branch is shippable; the user is expected to demo and iterate from there.
