# "Show, not tell" redesign — crawl-only, three axis demo cards

Design spec · 2026-04-25 · supersedes the [Pipeline Hero Card spec from 2026-04-24](./2026-04-24-webfetch-confusion-explainer-design.md), whose implementation is removed wholesale by this redesign.

## Context

The current docs-lens UI has three problems exposed by a recent demo to engineers (not tech writers):

1. The Pipeline Hero Card shipped yesterday centers Claude-Code-specific behavior (`HAIKU CAP (100K)`, `25K tok`, `51% of page`). Its own disclaimer notes that Anthropic's server-side `web_fetch` is a different tool, but the diagram still leads with the Claude Code numbers — internally contradictory.
2. The five-profile `AgentStrip` (Claude Code / Cursor / MCP / Copilot / Claude API) implies docs-lens measures all five tools per-URL. We don't. We simulate one extraction model (HTML→markdown via Turndown, 100K cap) and compute hypothetical truncation under each profile's cap. Naming the bars after specific products is misleading.
3. `DiagnosticHero`'s axis observations are long paragraph-style prose with metaphors ("delivery truck", "suitcase", "packing peanuts"). Demo audience told us they want to be spoon-fed the actual artifacts; metaphors don't land.

The CTO has further specified that "no hallucinations" is a hard constraint: every claim and number must trace to a deterministic measurement.

## Goals

1. Replace prose with concrete artifacts in the three-axis diagnostic — show the literal probe results, the literal meta-card, the literal byte composition.
2. Drop framing that implies per-tool simulation we don't actually perform. Single canonical extraction model.
3. Crawl-only flow. Single-URL mode is removed.
4. Every dynamic value renders from a real measurement; the implementation must never emit a per-URL prediction for a tool we don't call.

## Non-goals

- Calling additional fetchers (no live `web_fetch`, no Cursor MCP, no Gemini, no ChatGPT URL tool).
- Rebuilding the 28 deterministic checks. They stay; they continue to feed the score; they back the drill-down expansion behind each axis card.
- Re-cutting the three axes themselves. Agent Retrieval / GEO / Context Management remain.
- Changing the streaming wire format. `/api/crawl/stream` SSE events keep their shape; only the payload types tighten.

## Architecture

Files touched:

### Delete entirely (10 files)
- `src/components/PipelineHeroCard.tsx`
- `src/components/PipelineDiagram.tsx`
- `src/lib/pipeline.ts`
- `src/components/AgentStrip.tsx`
- `src/components/URLInput.tsx`
- `src/hooks/useScan.ts`
- `src/hooks/useScanStream.ts`
- `src/lib/scan-stream.ts`
- `src/app/api/scan/route.ts`
- `src/app/api/scan/stream/route.ts`

### Modify heavily (8 files)
- `src/components/DiagnosticHero.tsx` — replace three paragraph axes with three demo cards. Keep the click-to-expand `AxisExpansion` drill-down (now triggered from each demo card).
- `src/lib/observations.ts` — gut paragraph generation; output `{tone, headline, fix?, axisData}` per axis. Delete every metaphor-laden string.
- `src/lib/types.ts` — remove `AgentProfile`, `DeliveryMode`, `AGENT_PROFILES`, `AGENT_LABELS`, `SUMMARIZED_MAIN_CONTEXT_TOKENS`. Add `ProbeResult`, `MetaCardData`, `AgentRetrievalData`, `GeoData`, `ContextData`. Update `ScanResult`, `SiteObservation`, `CrawlResult`.
- `src/app/page.tsx` — remove `mode === "scan"` branch, `URLInput`, the mode tab strip; crawl flow becomes the only entry surface.
- `src/lib/scan.ts` — drop `agentProfile` parameter (or keep accepted-but-ignored); drop `allAgentScores` computation; hardcode the canonical 100,000-char extraction cap; populate `axisData`.
- `src/lib/crawl.ts` — drop `agentProfile` from the public crawl API; aggregate per-page `axisData` into site-wide `axisData` per the rules in the **Aggregation** section below.
- `src/components/CrawlView.tsx` — remove the agent-profile dropdown from `CrawlForm`; per-page `PageRow` expansion uses the redesigned `DiagnosticHero`.
- `src/lib/why-content.ts` — verify entries still match check IDs (no checks deleted, but a sanity pass).

### New (4 files)
- `src/components/axis/AgentRetrievalCard.tsx` — HTTP probe results panel.
- `src/components/axis/GeoCard.tsx` — meta-card preview rendered from real metadata.
- `src/components/axis/ContextCard.tsx` — byte composition strip + content-start position strip.
- `src/components/AccuracyDisclaimer.tsx` — footer paragraph stating measurement scope.

## The three axis cards

Each card has the same shell: tone dot · axis label · tone tag (right side) · headline · the demo · optional fix line · "see the checks behind this →" expansion (uses existing `AxisExpansion` component).

### Agent Retrieval

A monospace probe-result panel. Four fixed probes in fixed order:

1. `GET <origin>/llms.txt` — pass if 200 with non-empty body that parses as llms.txt format.
2. `GET <page>.md` — pass if 200 with `Content-Type: text/markdown` (or matching alternative).
3. `GET <page>` with `Accept: text/markdown` — pass if response `Content-Type` is markdown; fail if HTML returned (not honored).
4. `GET /robots.txt` Content-Signals header — pass if `Content-Signals` directive is present in robots.txt body.

Each row renders: probe label · status text (number, "html", "none", "error") · detail · pass/fail mark.

Headline: `"X of 4 retrieval signals working."` Tone: 4 = clean (pass) · 2–3 = watch · 0–1 = concern (fail).
Fix line: rendered when `passingCount < 4`; copy is conditional on which subset failed (kept short, computed in `src/lib/observations.ts`).

### GEO — Generative Engine Optimization

A rendered "answer-engine card preview" using the page's actual `<meta>` tags. Five slots, always visible:

- `og:image` — render `<img src={ogImageUrl}>` with `onError` falling back to `og:image present (couldn't render)` tile when present, or `no og:image` placeholder block when absent.
- domain (computed from final URL)
- title (`<title>`, truncated at 100 chars + ellipsis)
- description (`<meta name="description">`)
- canonical URL + og:title — collapsed into one line each, marked `⚠ no <field>` when missing.

Headline scales with `presentCount` (0–5):
- 5/5 → `"Your card is complete."` (clean tone)
- 3–4 → `"Your card has gaps."` (watch tone)
- 0–2 → `"Your card is missing its name and image."` (concern tone)

Fix line: rendered when `presentCount < 5`; enumerates missing fields. Computed in `src/lib/observations.ts`.

A small footnote under the card: `↑ rendered from your page's actual <meta> tags. This is what ChatGPT, Perplexity, and Google AI Overviews show when they cite you.`

### Context Management

Two stacked strips:

**Strip 1 — byte composition.** Horizontal stacked bar of `result.budget.segments` (already produced by `src/lib/budget.ts`). Five segment kinds: `content` (green), `chrome` (orange), `scripts` (red), `styles` (indigo), `other` (grey). Each segment shows its percentage inline if ≥ 8%; otherwise just the color stripe. Below the bar: a small key with color swatches and labels.

Above the bar: `"<htmlBytes> HTML"` left-aligned, `"→ <markdownBytes> chars markdown"` right-aligned in muted color.

**Strip 2 — content-start position.** A thin horizontal bar tinted red from 0 to `contentStartPct` (preamble) and green from `contentStartPct` to 100 (content). A red or green vertical mark at the boundary. Below the strip, a one-line caption: `"First meaningful heading at <pct>%"` with the pct color-coded.

Headline scales with `contentSharePct` (% of total bytes that are content) and `contentStartPct`:
- `contentSharePct ≥ 30` and `contentStartPct ≤ 20` → `"Your content reaches the agent quickly."` (clean)
- `contentSharePct ≥ 20` OR `contentStartPct ≤ 50` → `"Your content is X% of bytes — typical for static docs."` (watch)
- `contentSharePct < 10` OR `contentStartPct > 80` → `"Your content is X% of bytes."` (concern)

Fix line conditional on which dimension fails (low share vs late start). Computed in `src/lib/observations.ts`.

## Page structure & data flow

Top-to-bottom:

```
Sub-bar (wordmark · tagline · methodology link)
Crawl form (URL · max pages · Crawl button)
Edge-to-edge preview (HumanPanel | AgentPanel of seed page) — only while loading or after seed lands
Results section (max-w 1200px, 2-col grid):
  Left col:
    Site-wide axis cards (3 demo cards, aggregated from per-page data)
    Prioritized fixes list (existing IssueCard pattern, kept)
    Pages sampled (existing PageRow list; expansion shows per-page axis cards)
  Right col (sticky 280px):
    HistorySidebar
    MethodologyBlurb
    Download report button
Footer: AccuracyDisclaimer (one paragraph)
```

Data flow:

1. User submits URL + max pages → POST to `/api/crawl/stream` (existing).
2. Server emits SSE events: `page-discovered`, `page-scanned`, `crawl-complete` (existing wire format).
3. Each `page-scanned` event includes a full `ScanResult` whose `axisData` is computed by `scan.ts` from check results + budget + content-start.
4. `crawl-complete` payload includes `result.observations: SiteObservation[]` of length 3 (one per axis), each carrying its own aggregated `axisData`.
5. Client renders aggregated cards above per-page list; per-page expansion reuses the same three card components against the page's individual `ScanResult.axisData`.

No new endpoints, no new SSE event types.

## Data model changes

Removed exports from `src/lib/types.ts`:
- `AgentProfile`, `DeliveryMode` types
- `AGENT_PROFILES`, `AGENT_LABELS` maps
- `SUMMARIZED_MAIN_CONTEXT_TOKENS` constant

`tokensFromChars` stays; still used in Context-card byte/token labels.

Updated `ScanResult` (drops 2 fields, adds 1):

```ts
export interface ScanResult {
  url: string;
  finalUrl: string;
  fetchedAt: string;
  pipeline: PipelineStep[];
  human: { statusCode: number; contentType: string; bytes: number; html: string };
  agent: {
    markdown: string;
    markdownBytes: number;
    truncatedAt: number | null;     // canonical 100_000 cap
    truncationReason: string | null;
    contentStartPct: number;
  };
  budget: { totalBytes: number; segments: ContentBudgetSegment[] };
  score: { overall: number; grade: string; byCategory: Record<CategoryId, { score: number; weight: number }> };
  checks: CheckResult[];
  axisData: { agent: AgentRetrievalData; geo: GeoData; context: ContextData };
}
```

Removed: `agentProfile`, `allAgentScores`. Added: `axisData`.

Updated `SiteObservation` (paragraph deleted, axisData added):

```ts
export interface SiteObservation {
  axis: Axis;
  tone: "clean" | "watch" | "concern";
  headline: string;
  fix?: string;
  axisData: AgentRetrievalData | GeoData | ContextData;
}
```

New types:

```ts
export interface ProbeResult {
  label: string;          // "GET /llms.txt"
  statusText: string;     // "200" | "404" | "html" | "none" | "error"
  detail: string;         // "3.2 KB · 38 link entries"
  pass: boolean;
}
export interface AgentRetrievalData {
  probes: ProbeResult[];  // exactly 4, fixed order
  passingCount: number;   // 0..4
}

export interface MetaCardData {
  domain: string;
  title: string | null;
  description: string | null;
  canonicalUrl: string | null;
  ogTitle: string | null;
  ogImageUrl: string | null;
  presentCount: number;   // 0..5
}
export interface GeoData {
  card: MetaCardData;
}

export interface ContextData {
  htmlBytes: number;
  markdownBytes: number;
  budgetSegments: ContentBudgetSegment[];
  contentStartPct: number;
  contentSharePct: number;
}
```

`CrawlResult.agentProfile` is removed.

## Aggregation rules (site-wide axis data)

Computed in `crawl.ts` after all per-page scans complete:

| Axis | Source for the site-wide card |
|---|---|
| Agent Retrieval | Origin page's probes verbatim. llms.txt and Content-Signals are site-level; `.md` and `Accept` use the seed URL — consistent with what a user lands on. Per-page `.md` results remain visible in expanded `PageRow`s. |
| GEO | Seed page's `MetaCardData` rendered in the card. Footnote (when N > 1): `"X of N pages have all 5 fields"` computed across pages. |
| Context | `htmlBytes` = sum across pages, `markdownBytes` = sum, `budgetSegments` = sum bytes per segment then re-percent, `contentStartPct` = median, `contentSharePct` = computed from summed segments. Footnote: `"Median across N pages"` (suppressed when N === 1). |

## Edge cases & guardrails

### Probe edge cases

| Probe outcome | Status text | Pass | Notes |
|---|---|---|---|
| 200 + correct Content-Type | `"200"` | true | |
| 200 + wrong Content-Type | `"html"` (or actual type) | false | detail: `"<type> (not honored)"` |
| 404 | `"404"` | false | |
| Network error / timeout | `"error"` | false | neutral grey mark, not red ✗ |
| 200 + empty body | `"empty"` | false | |

Four probes always render; row count fixed at 4 even if a probe couldn't be attempted.

### Meta-card edges

- Field missing → render `⚠ no <field>` line in card body. Card always renders all five slots so the gap is visible.
- `<title>` > 100 chars → truncate to 100 + `…`.
- Multiple `<title>` or competing tags → use first-found (document the rule once near the parser).
- `og:image` URL present → `<img>` with `onError` fallback to a "og:image present (couldn't render)" tile.

### Context edges

- `markdownBytes === 0` → byte bar still rendered if `htmlBytes > 0`; position bar shows `"no content extracted"`, neutral state (not red).
- `htmlBytes < 1024` → ratios still meaningful; tone clean unless content share is degenerate.
- All-zero segments → fallback to grey `"byte composition unavailable"` placeholder.
- `htmlBytes` capped at 10 MB by fetch layer → small footnote `"fetch capped at 10 MB"` only when the cap was hit.

### Crawl-level edges

- `pages.length === 1` → site-wide cards equal origin-page cards; aggregation footnotes suppressed.
- All pages errored → empty results; error shown in `CrawlForm`.
- Some pages errored → `pages-sampled` header notes `"X/N pages had errors and were skipped"`; aggregation excludes errored pages.

### Loading state

While the crawl streams, the three site-wide axis cards render as **skeleton placeholders** — gray bars at approximate heights, no numbers, no fake content. Numbers appear only on `crawl-complete`.

## Hard constraints — claims we never make

The implementation must never emit:
- `"Claude Code shows X tokens to your main context"` — we don't call Haiku per-URL.
- `"Cursor sees X% of your page"` — we don't call Cursor's MCP.
- `"ChatGPT/Gemini will return Y"` — we don't call them.
- Any per-URL prediction for a tool we don't measure.
- Any "you'd see X but they'd see Y" comparison across tools we don't both call.

Every dynamic string traces to either a `ScanResult.checks` entry or a measured HTTP response. Code review must reject any string that introduces a per-tool prediction.

## Accuracy disclaimer (footer)

Verbatim text rendered by `<AccuracyDisclaimer>` at the bottom of the page:

> **About these measurements.** docs-lens fetches each page once via HTTP (no JavaScript execution), converts HTML to markdown via Turndown, and runs 28 deterministic checks. The probes and byte composition above describe what an extraction-style fetcher — Claude Code's `WebFetch`, Jina Reader, and many MCP servers — would see. They do **not** describe what claude.ai's server-side `web_fetch` (which uses Readability extraction), headless-browser agents like ChatGPT's URL viewer, vision-capable models, or accessibility-tree readers actually receive. Pages built as JavaScript-rendered SPAs can look very different to those other readers. No simulation, no LLMs in the scoring path — every number above ties to a real HTTP response or a deterministic check on the fetched HTML.

## Acceptance criteria

1. `next dev` boots cleanly; `npx tsc --noEmit` exits 0; `npm run lint` exits 0 (16-error baseline allowed only if pre-existing in untouched files; the redesign does not introduce new lint errors).
2. Single-URL mode is fully removed — no `URLInput`, no `mode === "scan"` branch, no `/api/scan*` routes.
3. `AgentStrip`, `PipelineHeroCard`, `PipelineDiagram`, `pipeline.ts`, `useScan*`, `scan-stream*` files do not exist.
4. Crawling any docs URL produces three axis demo cards above the prioritized-fixes list, each rendering the right shape per the design (probe panel / meta-card / strip pair).
5. Per-page expansion in the pages-sampled list renders the same three axis demo cards scoped to that page.
6. Footer renders the accuracy disclaimer verbatim.
7. The four QA URLs from the previous spec all crawl successfully and render distinct, accurate cards. Verified visually in browser:
   - `https://docs.stripe.com/api`
   - `https://docs.ekline.io`
   - `https://developers.cloudflare.com/workers/`
   - one EkLine internal docs subpath
8. No string in the redesigned code emits a per-tool prediction listed under **Hard constraints**.

## Testing approach

The project has no test runner; the redesign does not add one. Verification is layered:

- `npx tsc --noEmit` per modified file (incremental).
- `npm run lint` after each batch of changes; no new errors introduced beyond the 16-error pre-existing baseline.
- `tail dev.log` for Turbopack HMR errors after each save.
- Manual browser QA on the four URLs in acceptance criterion 7.
- Diff inspection of changed files with the spec — every new dynamic string must trace to scan data or a check ID.

`computeStages` and similar pure helpers stay testable; if a future PR adds vitest, the existing structure is ready.

## Out of scope

- Re-cutting the three axes (Agent / GEO / Context stay).
- Adding new deterministic checks. The 28 we have today are sufficient inputs for the demos.
- Scoring algorithm changes. Score, grade, weighted-category breakdown are unchanged.
- Adding or removing crawl features (sitemap discovery, llms.txt-driven crawl, etc.).
- New API endpoints. `/api/crawl` and `/api/crawl/stream` are the only entry points.
- Persisting the `agent` query parameter on `/api/crawl/stream` for backward compatibility — accept and ignore.

## References

- Pre-existing crawl pipeline: `src/lib/crawl.ts`, `src/app/api/crawl/stream/route.ts`.
- Existing budget computation: `src/lib/budget.ts` (already produces the segments the Context demo consumes).
- Existing per-axis check list: `src/lib/types.ts → AXIS_OF`.
- Existing per-axis observations (to be replaced): `src/lib/observations.ts`.
- Yesterday's superseded spec: `docs-lens-next/docs/superpowers/specs/2026-04-24-webfetch-confusion-explainer-design.md`.
- Brainstorm session screens: `.superpowers/brainstorm/10357-1777111957/content/`.
