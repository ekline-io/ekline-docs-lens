# Docs Lens — Prune & Teach (v2)

**Status:** Design, awaiting implementation plan
**Date:** 2026-04-29
**Author:** Bipin (with Claude)

## 1. Goal

Today's docs-lens is a behemoth. ~11.6k LOC across 101 files. Six reader profiles, thirteen deterministic checks, four prose linters (Vale/retext/alex/markdownlint), a fix engine with axis and audience classifiers, a crawler with a 1000-page cap, SSE streaming, run persistence, scan history sidebar, comparison/diff routes, per-page and per-profile drilldown routes, an axis scorecard, three-readings reframe, a methodology megapage. It works, but it's expensive to defend, slow to explain, and hard to position as a free tool. The reader does not feel taught — they feel measured.

The v2 thesis is the opposite: **substance over flash**. A free tool that teaches a docs lead — and the engineers around them — what actually happens when an agent reads their site, and exactly what to do about it. Not a dashboard. An education.

Three things drive the redesign:

1. **The visual hook** — for any page on a user's docs site, show the rendered page next to what an agent literally receives. The divergence is the lesson; everything else is supporting evidence.
2. **The educational triangle** — three reader profiles, each grounded in named real products, no abstractions. *Raw HTTP fetcher*, *headless browser*, *search snippet*. If a finding doesn't tie back to one of those three, it does not appear.
3. **The agent-fix prompt** — every scan ends with a copyable prompt the user pastes into Claude Code, Cursor, or any coding agent to actually fix the findings. Inspired by [buildwithfern's agent-score report format](https://buildwithfern.com/agent-score). Substance + actionable.

The product question every screen answers: **"Which agents struggle to read your docs, why, and what's the prompt that fixes it?"**

No LLMs in the scoring path. Every claim ties to a real HTTP response, a real release note, or a deterministic tool's output a skeptic can re-run.

## 2. Non-goals

- Not a general SEO auditor. Scope is docs sites and AI-agent ingestion.
- Not a CMS or fix-applier. We surface findings and the fix prompt; humans (or their agents) apply changes.
- Not a paid product in v2. Free tool. The hosted version stays cheap by avoiding our own Playwright fleet (proxy heavy work where possible — see §6.2).
- Not a crawl-the-whole-internet tool. The crawl exists, but the cap is small and the framing is page-first, not site-first.
- Not a benchmark / leaderboard / scoring competition. The grade exists at the bottom of the report as a shareability handle, not as the headline.
- Not a replacement for `npx afdocs check`. We complement it. The agent-fix report tells users to run afdocs locally for deeper output.

## 3. Audience

- **Technical writer / docs lead** — primary user. Pastes their docs URL, walks away with three things: a clear story of which agents see their content and which don't, a ranked list of fixes with the *why* explained, and a prompt to hand to whichever coding agent they have. They should leave the page understanding something they didn't before.
- **Engineer adjacent to docs** — secondary user. Receives the agent-fix prompt from the writer, runs it. Wants the prompt to be specific, defensible, and self-contained. No hand-waving.
- **Shareable surface** — anyone who sees the report linked in Slack/Twitter. The visual hook needs to make sense in five seconds without context. The grade at the bottom gives them a number to quote.

## 4. The three profiles

The previous version had six profiles (rawHttp, readability, headless, axTree, structured, jina). Research into how named real products actually fetch web content shows three meaningful populations.

### 4.1 Raw HTTP fetcher

What it is: a server-side HTTP fetch with no JavaScript execution, often followed by HTML-to-markdown conversion (Turndown), with `<style>` and `<script>` content stripped before extraction. Output is a markdown blob with a hard byte/char cap.

Real consumers:

- **Claude Code `WebFetch`** — confirmed in the [`anthropics/claude-code` v2.1.105 changelog](https://raw.githubusercontent.com/anthropics/claude-code/refs/heads/main/CHANGELOG.md): *"Improved WebFetch to strip `<style>` and `<script>` contents from fetched pages so CSS-heavy pages no longer exhaust the content budget before reaching actual text."* No JS, Turndown to markdown, 100KB markdown char cap, then a Haiku summarization sub-call.
- **Anthropic API `web_fetch` tool** (server-side, beta) — same family.
- **Continue.dev** — `HttpContextProvider.ts` does plain HTTP then markdown conversion.
- **Aider** without Playwright installed — falls back to `httpx`.
- Most other coding-agent CLIs.

Implementation: keep the existing `src/lib/profiles/rawHttp.ts` — the current Turndown pipeline is already correct.

### 4.2 Headless browser

What it is: a Chromium-based browser that fully executes JavaScript and renders CSS before extracting content. The agent reads from the post-render DOM (or an accessibility tree, or a Readability-filtered subset).

Real consumers:

- **ChatGPT Atlas** — full Chromium via OpenAI's "OWL" layer.
- **Perplexity Comet** — Chromium-based browser.
- **Cline** — built-in Puppeteer browser tool.
- **Roo Code** — same Puppeteer tool plus Playwright-MCP option.
- **Aider** with Playwright installed — uses Chromium.
- **Modern Bingbot / Googlebot Web Rendering Service** — index-side renderer used by Bing Chat, Microsoft Copilot, GitHub Copilot Chat web grounding, and Gemini URL context (when the URL is already in Google's index). These deserve a footnote on the headless card: same render pipeline, but staler — the agent reads what was indexed last week, not what's on your page right now.

Implementation: keep the existing `src/lib/profiles/headless.ts` — Playwright Chromium, post-JS DOM. For hosted v2 we proxy this through Jina Reader (`r.jina.ai`) when running in the cloud to avoid bundling Playwright; localhost dev keeps Playwright. See §6.2.

### 4.3 Search snippet

What it is: never sees a full page. The agent receives a ranked snippet — usually `<title>`, `<meta name="description">`, OG tags, the first H1, and ~200 characters of visible text. Decisions are made on metadata, not content.

Real consumers:

- **ChatGPT Search** (Bing-grounded snippets)
- **Anthropic API `web_search` tool** (Brave-backed snippets)
- **Perplexity** declared bot (snippet-first; full body fetched separately)
- **Cursor `@web` and `@docs`** (chunked-and-embedded crawl, returns embedding chunks not pages)
- **Phind**, **You.com**, **GitHub Copilot Chat** web grounding (Bing snippets)

Implementation: new `src/lib/profiles/snippet.ts`. Fetches the page, extracts the first 200 chars of visible text, `<title>`, `<meta name="description">`, OG/Twitter card tags, first H1, and JSON-LD if present. This is the only profile we *build new*; it absorbs the useful parts of the current `structured.ts` and replaces the role `readability.ts` played without inheriting Readability's quirks.

### 4.4 What gets deleted

| File | Reason |
|---|---|
| `src/lib/profiles/axTree.ts` | Accessibility tree — no real consumer named this profile in research |
| `src/lib/profiles/readability.ts` | Subsumed by snippet for metadata, by headless for full content |
| `src/lib/profiles/jina.ts` | Headless+Readability combo; redundant with headless profile (Jina becomes infra in §6.2, not a profile) |
| `src/lib/profiles/structured.ts` | Useful parts move into snippet; structured-as-a-profile is a category mistake |
| All four prose linters (Vale, retext, alex, markdownlint) under `src/lib/prose/` | Out of scope for AI-readiness; these audit *English*, not how agents read |

## 5. UI structure

### 5.1 Homepage `/`

Single screen. Three elements:

1. URL input + "Scan" button. (Keep the optional cap selector.)
2. One sentence above: **"See what every agent reader gets when it visits your docs site — and the prompt to fix what's broken."**
3. Below the input: a static demo of the visual hook with a fake page, three labeled tabs (`Raw HTTP`, `Headless`, `Snippet`), each with a one-line caption naming the agents that use it. Pre-scan teaching: the user understands the product before they paste a URL.

Delete: `RecentScans` sidebar (run history), `AccuracyDisclaimer` block in its current form (the disclaimer is now a single footnote), the live time-remaining ETA component (replace with a simple progress bar — the dev infra was overkill for the experience).

### 5.2 Scan summary `/scan/[id]`

The site-level view. Shape:

```
[ progress bar / status, while running ]

[ One-sentence verdict ]
"Headless browsers see all your content. Raw HTTP fetchers see 53% of it.
 Search snippets see your homepage but miss every API page."

[ Three profile status cards ]
Raw HTTP — Partial · 18 of 32 pages have findings
Headless — Good
Snippet — Broken · 26 of 32 pages have no description

[ Page list ]
A small table: URL · profile statuses (three colored dots) · # findings.
Click a row → drilldown.

[ Findings, ranked, rolled up ]
Each finding has:
  - Title + the affected profile(s)
  - One-paragraph "why this matters" with a citation where one exists
    (e.g., "Claude Code v2.1.105 strips <style> tags before reading content
     — your inline-rendered code blocks are unreachable.")
  - "Pages affected: 18" with expandable list
  - Concrete remediation

[ Agent Fix Prompt — copyable block ]
The Fern-style report — markdown, ready to paste into Claude Code, Cursor, or any
coding agent. Generated from the findings. Includes:
  - Site URL + scan summary
  - Failing checks grouped by category
  - Per-finding fix instructions
  - Pointer to "npx afdocs check <url> --fixes --verbose" for deeper output

[ Three explainer cards ]
"What is Raw HTTP?" / "What is Headless?" / "What is Snippet?" —
each names the real consumers and links to the citation.

[ Footer ]
"This scan would grade as B (78/100)" — small, footer-level. Share button.
```

Routes deleted: `/scan/[id]/profile/[profileId]`, `/scan/[id]/compare/[other]`. The per-profile drilldown is redundant once the snapshot summary groups findings by profile, and the comparison route was flash without education.

### 5.3 Page drilldown `/scan/[id]/page/[path]`

Where the visual hook lives. This is the most important screen.

Shape: **two-column with profile tabs.** This was validated in user demos.

```
[ Page header: URL, status per profile ]

[ Two-column hero ]
LEFT: rendered page (iframe; collapses to screenshot thumbnail on mobile).
RIGHT: text panel with tabs:
  Tab 1 — Raw HTTP    "What Claude Code, Cursor, Continue, Aider see"
  Tab 2 — Headless    "What Atlas, Comet, Cline, Roo Code see"
  Tab 3 — Snippet     "What ChatGPT Search, Perplexity, You.com see"

When Raw and Headless diverge sharply, a callout appears above the tabs:
  "⚠️ Raw HTTP saw 47% of what Headless saw on this page. The missing 53%
   is rendered by JavaScript that Raw HTTP doesn't execute."

[ Per-page findings ]
Same finding-card pattern as the scan summary, but scoped to this page only.
Annotations point into the text panels where possible
("This nav block ate 47% of the markdown budget — here it is in the Raw HTTP tab").
```

### 5.4 Methodology `/methodology`

Becomes a single page, much shorter. Three sections:

1. **The three profiles** — one paragraph each, with the citation table.
2. **What we check** — the deterministic checks list, each with a short description and the profile(s) it affects.
3. **What we don't measure** — the disclaimer block. The product is opinionated about what *not* to score.

Delete the current methodology megapage's "site probes / drilldown views / persistence" sections — those described the previous version's complexity and don't survive the prune.

## 6. Architecture

### 6.1 Module map (after prune)

```
src/lib/
  core/
    types.ts           Profile, ProfileResult, PageResult, RunResult, Finding
    profile.ts         Profile interface
    runner.ts          orchestrator — kept, simplified
    run-store.ts       on-disk persistence — kept
    browser-pool.ts    Playwright pool — kept (used by headless profile)
  crawl/
    discover.ts        sitemap + subpath BFS — kept, default cap drops from 1000 to 50
    queue.ts           concurrency + politeness — kept
  profiles/
    rawHttp.ts         kept unchanged
    headless.ts        kept; in cloud, may proxy through Jina Reader (§6.2)
    snippet.ts         NEW — title, meta, OG, first H1, first ~200 chars, JSON-LD
  checks/              kept; cull any check whose only consumer was a deleted profile
  fix/
    engine.ts          kept; ranking weights re-tuned for three-profile model
    attribution.ts     kept; profile mapping reduced from 6 → 3
    prompt.ts          NEW — generates the Fern-style copyable agent fix prompt
  diff/
    profile-diff.ts    kept but only used inside the page-drilldown two-column view
                       to compute the "Raw vs Headless saw N% different" callout
  budget.ts            kept
  scoring.ts           kept; grade computation now lives at the page footer, not headline
```

Deleted:

```
src/lib/profiles/axTree.ts
src/lib/profiles/readability.ts
src/lib/profiles/jina.ts          (logic absorbed into headless.ts as fallback infra)
src/lib/profiles/structured.ts    (logic absorbed into snippet.ts)
src/lib/prose/                    (entire directory: Vale, retext, alex, markdownlint)
src/components/AxisExpansion.tsx
src/components/axis/              (entire directory)
src/components/HistorySidebar.tsx
src/components/ContentBudgetBar.tsx
src/components/ScoreBar.tsx
src/components/TrendSparkline.tsx
src/components/DiagnosticHero.tsx
src/components/scan/RecentScans.tsx
src/lib/why-content.ts            (replaced by per-finding educational copy in fix engine output)
src/app/scan/[id]/profile/[profileId]/page.tsx
src/app/scan/[id]/compare/[other]/page.tsx
src/app/api/profile/route.ts
src/app/api/profiles/route.ts
src/app/api/badge/route.ts        (badge feature dropped — no longer headlining a number)
```

Estimate: ~40-50% LOC reduction. Behemoth → educational tool.

### 6.2 Hosting strategy for headless

Playwright is heavy to host on Vercel. Two paths:

- **Local dev** keeps Playwright (`headless.ts` uses local Chromium).
- **Hosted v2** proxies the headless fetch through Jina Reader's free public endpoint (`https://r.jina.ai/<url>`). Jina runs Puppeteer + Chrome on their side and returns markdown. The headless profile's interface stays the same; the *implementation* swaps based on `process.env.HEADLESS_BACKEND`. Localhost = `playwright`. Production = `jina`.

This is why we delete `jina.ts` as a separate profile but keep Jina as *infrastructure* under the headless profile. The user-facing model stays clean (three profiles), the engineering accommodates reality.

### 6.3 The agent-fix prompt

Generated by `src/lib/fix/prompt.ts`. Inputs: scan summary + ranked findings. Output: a single markdown blob shaped like Fern's report (verified against the example the user pasted in the brainstorm):

```
# Agent Score Fix Report — <Site Name>
URL: <site URL>
Score: <n>/100 (Grade <X>)

I need help improving the AI-readiness of the documentation at <URL>.
Docs Lens found <N> failing checks and <M> warnings.

## Failing Checks (<N>)
- [<category>] <check name>: <one-line summary with affected count>
…

## Warnings (<M>)
- [<category>] <check name>: <one-line summary>
…

## Fix Instructions
For each issue above, please:
1. Analyze the documentation site at <URL>
2. Implement the specific fix
3. Verify the fix would cause the check to pass

### Common fixes:
<one bullet per finding category, taken from a fixed lookup table keyed by check id>

## Run afdocs Locally for More Detail
  npx afdocs check <URL> --fixes --verbose
```

Two design choices in this output:

- **The grade is in the prompt header** even though it's footer-level in the UI. The prompt needs to be self-contained when pasted elsewhere — without the grade line, the prompt loses its anchor.
- **The "Common fixes" lookup table** lives next to the checks themselves, not as a separate `why-content.ts` map. Each check exports its own fix copy. Substance lives with the thing it describes.

## 7. The grade — at the bottom, not the top

Decision from the brainstorm: the grade exists for shareability, not for headline. The score (0-100) and letter (A-D) appear once, in the footer of the scan summary page, in muted type, with a "share" button. The agent-fix prompt header keeps the grade because the prompt is portable and needs the anchor.

The headline of the scan summary is the **one-sentence verdict** ("Headless browsers see all your content. Raw HTTP fetchers see 53% of it. Search snippets see your homepage but miss every API page."), generated from the three profile statuses. Score-as-headline is the rhetoric we're explicitly rejecting.

## 8. Migration

The current branch (`prototype/docs-lens-multi-profile`) ships the multi-profile engine and three-axis UI. v2 prunes it. Sequence:

1. **Land profile reduction** — delete `axTree`, `readability`, `jina` (as profile), `structured`. Add `snippet`. Update profile registry + tests.
2. **Land prose-linter deletion** — remove `src/lib/prose/`, related checks, related UI.
3. **Land UI prune** — delete deprecated components, axis system, history sidebar, comparison route, per-profile route, badge route. Replace with the §5 layouts.
4. **Build the agent-fix prompt generator** — new `src/lib/fix/prompt.ts` and the copy-block UI on the scan summary page.
5. **Build the snippet profile** — new `src/lib/profiles/snippet.ts`, plumb into runner.
6. **Implement the two-column page drilldown** — the visual hook. Tabs, divergence callout, per-page findings.
7. **Rewrite methodology page** — single short page replacing the megapage.
8. **Move grade to footer** — wire share button, remove headline score everywhere it currently appears.
9. **Hosting backend swap** — `HEADLESS_BACKEND` env, Jina Reader integration for production.

Each step is independently shippable. The plan document will sequence them with checkpoints.

## 9. Success criteria

The v2 is done when:

- A first-time visitor lands on the homepage, looks at the demo, and can describe the three profiles in their own words within 30 seconds.
- The scan summary page leads with the one-sentence verdict, not a number.
- The page drilldown's two-column view is the most-visited route in analytics within two weeks of launch.
- The agent-fix prompt is copied at least once per session by 50%+ of users who reach the scan summary.
- LOC drops by 40%+ from the current behemoth without losing the ability to defend any number on the page.
- A reader who follows a link to a scan from Twitter understands what they're looking at without reading the methodology page.

## 10. Open questions

- **Sample homepage demo**: the static pre-scan demo in §5.1 needs a real page to show. Use docs.ekline.io? A neutral well-known docs site (Stripe, Tailwind)? TBD in the implementation plan.
- **Grade formula**: keep the existing scoring, or simplify? Probably leave as-is for v2 — the grade is no longer load-bearing, so the formula doesn't need a redesign.
- **Hosted deployment target**: Vercel is assumed. The Jina-as-headless-backend approach makes Vercel viable, but if we hit rate limits we may need a small Cloudflare Worker in front of Jina to cache responses.
