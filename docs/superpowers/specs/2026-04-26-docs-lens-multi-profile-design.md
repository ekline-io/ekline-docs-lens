# Docs Lens — Multi-Profile Upgrade

**Status:** Design, awaiting plan
**Date:** 2026-04-26
**Author:** Bipin (with Claude)

## 1. Goal

Today's docs-lens describes what a single class of agent reader sees: an extraction-style HTTP fetcher (Claude Code's `WebFetch`, Jina, MCP fetchers). The footer disclaimer admits this and lists the readers it does *not* describe — Readability extraction, headless browsers, accessibility-tree readers. Users see a number that sounds authoritative ("47% of bytes wasted") but only applies to one of many reader profiles.

The upgrade closes that gap. For any URL, the tool runs the page through six readers in parallel, surfaces the *delta* between them, and produces a ranked, actionable fix list tagged with which reader each fix actually helps. It does this for the whole site, not just the page that was pasted in.

The product question every screen answers is: **"Does the agent that matters to you actually receive your docs — and if not, what do I fix first?"**

No LLMs in the scoring path. Every number ties to a real HTTP response or a deterministic tool's output a skeptic can re-run.

## 2. Non-goals

- Not a general crawler / SEO auditor. Scope is docs sites and AI-agent ingestion.
- Not a CMS / fix-applier. We surface findings; humans fix.
- Not building our own LLM-based extractor. The "real" reader signal comes from Jina's free public endpoint, not from us calling a model.
- v1 runs on localhost only. Vercel-friendly architecture so the Playwright bit can swap to a managed browser API later, but no hosting work in v1.

## 3. Audience

Two specific people we're designing for:

- **ENTJ CEO** scanning the homepage in 5 seconds. Wants a defensible headline number, a clear "this is broken" / "this is fine" verdict, and a sense that the tool has range. Won't read fine print.
- **ISTJ CTO** opening the codebase. Wants every claim traceable to a tool's output, no hand-waving, modules with one job each, deterministic re-runs.

And one persona who actually uses it weekly:

- **Technical writer / docs lead** with a backlog and limited time. Wants a ranked fix list, not 200 findings. Wants each finding to say *which reader profile it hurts* so they can argue scope with their PM ("we don't care about Perplexity → skip these eight").

## 4. Architecture

### 4.1 Layer cake

```
UI                Next.js App Router + React
                  /, /scan/[id], /scan/[id]/page/[pageId], /scan/[id]/profile/[profileId]
                       │ scanId, SSE stream
API                /api/scan, /api/scan/[id]/stream
                       │ Run config
Engine             Crawler ──→ Profile fan-out (6) ──→ Checks ──→ FixEngine + DiffEngine
                       │
Adapters          undici · jsdom+Readability · Playwright · cheerio · Vale · retext · Jina
```

Every layer has a clean interface to the one below. The crawler doesn't know about profiles; profiles don't know about checks; checks don't know about UI.

### 4.2 Module map (new layout under `src/lib/`)

```
src/lib/
  core/
    types.ts           Profile, ProfileResult, PageResult, RunResult, FixFinding
    profile.ts         Profile interface
    run.ts             orchestrator (replaces current scan.ts entry point)
  crawl/
    discover.ts        sitemap + subpath BFS, 250-page soft cap
    queue.ts           concurrency + politeness (1 req/host/sec default)
  profiles/
    rawHttp.ts         current Turndown pipeline, unchanged
    readability.ts     jsdom + @mozilla/readability
    headless.ts        Playwright Chromium, post-JS DOM
    axTree.ts          Playwright accessibility snapshot
    structured.ts      JSON-LD / OG / schema.org via cheerio
    jina.ts            passthrough to https://r.jina.ai/<url>
  checks/              existing 28 checks, made profile-aware
  prose/
    vale.ts            Vale runner (Microsoft + Google + custom AI pack)
    retext.ts          retext-readability + retext-simplify + retext-passive
    alex.ts            inclusive language
    markdownlint.ts    structure of converted markdown
  fix/
    engine.ts          merges all findings, dedupes, ranks by impact
    attribution.ts     maps findings → affected profiles (only the defensible 6-8)
  diff/
    profile-diff.ts    token/char/structure deltas across profiles for one page
    site-stats.ts      site-level rollups ("47% of pages JS-gate content")
  tokenizer/
    count.ts           anthropic-tokenizer + tiktoken (deterministic, no API)
```

**Why this shape:** every file has one reason to change. Adding a seventh profile = one new file in `profiles/`. Adding a new prose linter = one new file in `prose/`. Swapping local Playwright for Browserless later = touching only `profiles/headless.ts` + `profiles/axTree.ts`.

### 4.3 Data model (core types)

```ts
interface Run {
  id: string;
  rootUrl: string;
  startedAt: number;
  finishedAt?: number;
  pages: PageResult[];
  siteStats: SiteStats;
  fixes: FixFinding[];
}

interface PageResult {
  url: string;
  profiles: Record<ProfileId, ProfileResult>;
  checks: CheckResult[];
  diff: ProfileDiff;
}

type ProfileId = "rawHttp" | "readability" | "headless" | "axTree" | "structured" | "jina";

interface ProfileResult {
  id: ProfileId;
  ok: boolean;
  reason?: string;          // why it failed if !ok
  bytes: number;
  chars: number;
  tokensClaude: number;
  tokensGpt: number;
  markdown: string;          // canonical extracted text per profile
  rawArtifact?: string;      // post-JS HTML, ax tree JSON, etc.
  durationMs: number;
}

interface FixFinding {
  id: string;
  title: string;
  severity: "fail" | "warn" | "info";
  source: "check" | "vale" | "retext" | "alex" | "markdownlint" | "diff";
  evidence: string;          // exact quote / line / snippet
  affectedProfiles: ProfileId[] | "general";
  fixHint: string;           // concrete remediation
  pageUrl: string;
  occurrences: number;       // site-wide count of this same finding
}
```

`ProfileResult.markdown` is the canonical extracted text the UI renders side-by-side. Even profiles whose native output isn't markdown (a11y tree, structured data) are normalized to a markdown-ish string so the matrix view stays uniform.

## 5. The six profiles

| ID | Tool | Approximates | Cost |
|---|---|---|---|
| `rawHttp` | `undici` + `turndown` (existing) | Claude Code WebFetch, Jina, MCP fetchers | ~200 ms |
| `readability` | `jsdom` + `@mozilla/readability` | claude.ai `web_fetch`, Firefox Reader, Pocket | ~400 ms |
| `headless` | `playwright` Chromium, post-JS DOM → Turndown | ChatGPT URL viewer, browser-using agents | ~3-8 s |
| `axTree` | `playwright.accessibility.snapshot()` → flatten | Screen readers, a11y-tree consumers | ~3-8 s (shares browser w/ `headless`) |
| `structured` | `cheerio` over JSON-LD + OG + schema.org | Perplexity, Google answer engines, link unfurlers | ~150 ms |
| `jina` | GET `https://r.jina.ai/<url>` | Real-world reader API, ground truth anchor | ~1-3 s |

**Profile interface (all six conform):**

```ts
interface Profile {
  id: ProfileId;
  fetch(url: string, ctx: FetchContext): Promise<ProfileResult>;
}
```

Headless and axTree share a single `BrowserPool` (8 contexts) so we don't launch 12 Chromium instances. Other profiles are uncapped — they're cheap.

**Failure handling.** A profile that errors (Jina rate-limited, Playwright timeout, Readability returned null) returns `ok: false` with a reason. The matrix view renders an empty column with the reason in place of the markdown. The run continues; one profile failing never fails the run.

## 6. Crawler

`crawl/discover.ts` builds the page list:

1. Fetch `sitemap.xml` from the URL's host.
2. If found: take all URLs under the input URL's path prefix.
3. If absent: BFS from the input URL, following internal `<a href>` links, scoped to the same host + path prefix.
4. Deduplicate, normalize trailing slashes, drop fragments.
5. Cap at **250 pages** (soft). On hit, the UI shows a "scan more" button that re-runs with a 1000 cap.

`crawl/queue.ts` runs the work:

- Per-page work is fanned out across the six profiles (Promise.all internally; profiles are independent).
- Across pages: configurable concurrency, default 8 pages in flight at once.
- Politeness: max 1 req/host/sec on the cheap profiles, naturally bounded on Playwright by pool size.
- Streams page-completion events to the SSE bus as each page finishes.

## 7. Checks + prose layer + attribution

### 7.1 Existing 28 checks

Each existing check declares which `ProfileId` it consumes (most use `rawHttp` today). The check signature changes from `check(html, markdown)` to `check(profileResults)` so a check can compare across profiles where useful. Most checks stay rawHttp-only; a handful upgrade to be cross-profile (e.g., `rendering-strategy` becomes a real measurement: `headless.chars / rawHttp.chars`).

### 7.2 New prose layer

Runs once per page, on `headless.markdown` (the most complete extracted text). Tools:

- **Vale** with bundled styles: Microsoft + Google + a small custom **AI Readability** pack (vague pronouns, undefined acronyms, jargon density, instruction-clarity). Vale binary ships with the repo or installs on first run.
- **retext** pipeline: `retext-readability` (Flesch grade), `retext-simplify`, `retext-passive`.
- **alex** for inclusive-language flags.
- **markdownlint** on the converted markdown across profiles, surfaces "Turndown produced broken markdown."

Each finding becomes a `FixFinding`. Findings are deduped across pages — if the same Vale rule triggers 47 times site-wide it appears once with `occurrences: 47`.

### 7.3 Per-profile attribution

`fix/attribution.ts` is a hand-curated map from finding IDs to affected profiles. We commit to attribution for **only the cases where the link is genuinely defensible.** Examples:

| Finding | Affected profiles | Why |
|---|---|---|
| Long sentences (>40 words) | `readability` | Readability collapses paragraph whitespace; long sentences become one wall of text rather than scannable beats. |
| Vague pronouns ("this", "it" with no antecedent) | `rawHttp`, `jina` | Both produce flat markdown that gets chunked by RAG; chunks split context away from antecedents. |
| Code blocks without language tag | `readability`, `headless` | Both pass code through to markdown but lose the syntax-highlight signal that helps agents identify language. |
| H1 missing or duplicated | `readability`, `structured` | Readability uses H1 as the article title; structured-data picks H1 for `headline`. |
| Tables that don't survive Turndown | `rawHttp`, `jina` | Both rely on HTML→markdown conversion; complex tables collapse to plain text. |
| JS-rendered content | `rawHttp`, `readability`, `jina` | All three are non-rendering. Headless and axTree see it. Structured may or may not. |

For everything else, `affectedProfiles: "general"`. We will not invent attribution to make the matrix look fuller.

### 7.4 Ranking

`fix/engine.ts` ranks findings by:

1. Severity (fail > warn > info)
2. Site-wide occurrence count (more occurrences = higher impact)
3. Number of distinct profiles affected
4. Whether the finding is a check (load-bearing) vs prose (style)

The fix list always shows top 20 with a "show all" expander.

## 8. UI

### 8.1 Routes

- `/` — scan input form, history sidebar (existing, lightly restyled).
- `/scan/[id]` — main result page. Three sections, top to bottom: **headline strip**, **page-by-page matrix**, **ranked fix list**.
- `/scan/[id]/page/[pageIndex]` — per-page deep dive: six profile columns side by side, each rendering that profile's markdown with diff highlighting against the largest profile.
- `/scan/[id]/profile/[profileId]` — site-wide view of one profile: all pages as that reader sees them, with checks specific to that profile.

### 8.2 Section 1: headline delta strip

A single horizontal strip at the top of `/scan/[id]`. Five tiles:

1. **Site coverage** — pages scanned, sitemap source, "X% of sitemap covered."
2. **JS-gated content** — `(headless_chars - rawHttp_chars) / headless_chars` averaged across pages. The killer "47% of your docs hide content from raw fetchers" number.
3. **Readability survival** — `readability_chars / headless_chars` averaged. How much survives the claude.ai web_fetch path.
4. **Token budget** — average Claude tokens per page across profiles, with the highest-loss profile flagged.
5. **Fix backlog** — count of fail/warn findings, click to scroll to fix list.

Designed so the CEO sees the verdict in 5 seconds without scrolling.

### 8.3 Section 2: page matrix

Compact table, one row per page, columns for the six profiles plus a "fixes" count. Cells show token count + a tiny bar showing relative size vs the largest profile. Click row → drilldown.

### 8.4 Section 3: fix list

Ranked findings. Each row: severity icon, title, occurrence count, affected-profile chips, fix hint. Click → modal with full evidence and the page list where it occurs.

### 8.5 Drilldown: per-page profile compare

Six side-by-side scrollable panels (collapsible to fit narrow viewports — at <1280px they become a horizontal-swipe carousel, at <800px a vertical accordion). Top of each panel: profile name, status, char/token count, duration. Body: the markdown that profile produced, with text highlighting that shows what's missing relative to the union of all profiles.

A "diff mode" toggle highlights *only* the deltas between profiles, hiding shared content.

### 8.6 Drilldown: per-profile site view

For each profile, a list of every page with that profile's checks and metrics. Used by docs leads who care about one specific reader (e.g., "we only care about Claude Code → show me the rawHttp view across the whole site").

### 8.7 Reused components from current build

`DiagnosticHero`, `AgentPanel`, `HumanPanel`, `ScoreBar`, `TrendSparkline`, axis cards, `HistorySidebar`, `CrawlLog` all survive — repurposed inside the new shell, not thrown away. `AccuracyDisclaimer` updates to reflect the new methodology.

## 9. Streaming / progress

`/api/scan/[id]/stream` is Server-Sent Events. Event types:

- `crawl:discover` — emitted once with the full page list.
- `page:start` — page URL begins fetching.
- `profile:done` — one profile/page combo finished. Payload: profile id, page index, char count, token count.
- `page:done` — all six profiles done for a page. Payload: page checks summary.
- `prose:done` — prose layer finished for one page.
- `run:done` — entire run complete. Payload: site stats + fix list.

UI subscribes and progressively fills in the matrix as events arrive. Resumable: a reload re-attaches to the same SSE stream by run id.

## 10. Testing strategy

Per the user's testing rules (80% coverage target, TDD preferred, edge cases mandatory):

- **Unit**: each profile fetcher tested against captured HTML fixtures. Each check tested with a small representative HTML. FixEngine tested for ranking + dedup logic.
- **Integration**: full `Run` against three captured fixture sites — a static MDX site, a JS-heavy SPA, and an asymmetric site (rich HTML, broken Readability). Asserts site-stats match expected values exactly.
- **Snapshot**: per-profile markdown output for each fixture, so any extractor regression is visible in diff.
- **E2E**: Playwright test that opens `/`, submits a URL pointing at a local fixture server, waits for `run:done`, asserts the homepage strip renders the right numbers.
- **Edge cases tested explicitly**: URL with no sitemap; URL whose sitemap is malformed; URL that 4xx's; URL behind Cloudflare bot challenge; URL whose Readability returns null; URL that hangs Playwright (timeout path); Jina rate-limit response; site with > 250 pages (cap behavior).

## 11. Dependencies added

```
@mozilla/readability        — Readability extraction
jsdom                       — DOM for Readability
playwright                  — headless browser + a11y tree
@anthropic-ai/tokenizer     — Claude token counts (deterministic)
tiktoken                    — GPT token counts (deterministic)
markdownlint                — markdown structure linter
retext, retext-readability,
retext-simplify, retext-passive,
retext-stringify            — prose pipeline
alex                        — inclusive language
xmldoc or fast-xml-parser   — sitemap.xml parser
```

Vale is a Go binary; ship it via `npm install vale-bin` (community wrapper) or document `brew install vale` as setup.

## 12. Out of scope for v1

- Hosting / deployment (Vercel migration is post-v1).
- A11y-tree visualization beyond text dump.
- Custom Vale rule editing in-app.
- Multi-tenancy / accounts / auth.
- Diffing two scans of the same site over time (history exists, comparison UI doesn't).

## 13. Open questions resolved during brainstorming

- **Scope ambition:** all six profiles + full prose layer (option C with discipline on attribution).
- **Hosting:** localhost v1, Vercel-friendly architecture.
- **Profile set:** all five simulated + Jina passthrough = six columns.
- **Prose depth:** full Vale + retext + alex + markdownlint, with per-profile attribution only where defensible.
- **Site scope:** hybrid sitemap + subpath BFS, 250-page soft cap with "scan more" button.
- **UI:** rebuild around three-section homepage + per-page and per-profile drilldowns.
- **Architecture:** refactor in place with strict module boundaries.

## 14. Success criteria

- A first-time visitor reaches a verdict in under 10 seconds without scrolling.
- The CTO can open any number on screen and trace it to a specific tool's output in two clicks.
- A technical writer can sit down with the fix list, work top-to-bottom, and ship measurable improvements in a week.
- No claim in the UI requires the disclaimer "this is an estimate" — every number is what a tool produced. The only honest caveat (which stays in the footer) is that *simulated profiles approximate* their target readers; the Jina column is real ground truth.
