# Pipeline Hero Card — WebFetch confusion explainer

Design spec · 2026-04-24 · branch `prototype/docs-lens-webfetch-fidelity`

## Context

Users who ask claude.ai "what does Claude Code get from URL X?" receive answers produced by Anthropic's **server-side `web_fetch`** tool (Readability-extracted article body, wrapped in `<document>` tags). They then assume those numbers describe Claude Code's actual behavior. They don't.

Claude Code's real `WebFetch` is a different tool: local Axios fetch → Turndown HTML-to-markdown (no extraction) → up to 100 KB fed into a Haiku sub-call → Haiku's short answer is what reaches the main context. The CTO-supplied TypeScript replica (`webfetch.ts`) makes this explicit.

On the same URL the two tools can disagree by 10–100×. Measured example: `docs.stripe.com/api` returns ~1,474 chars through `web_fetch` but 196,119 chars of markdown through docs-lens's simulation of the real `WebFetch` path. docs-lens already simulates the correct pipeline; the UI just doesn't surface the distinction loudly enough.

## Goals

1. Anchor the `web_fetch` vs `WebFetch` distinction at the top of every scan so the next person reading docs-lens output doesn't conflate the two tools.
2. Make the real pipeline legible by showing the stages content passes through, with this scan's measured numbers at each stage.
3. Keep the diagram profile-aware so users see the correct pipeline when they switch between Claude Code, Cursor, MCP, Copilot, and Claude API in the existing `AgentStrip`.

## Non-goals

- No live call to Anthropic's `web_fetch` for side-by-side comparison. We describe the difference; we don't measure both paths per scan.
- No changes to scoring, check logic, or observations copy. Purely additive UI.
- No crawl-mode surface in v1. Scan mode only.
- No dismissibility. The card is always rendered for every completed scan.

## Architecture

Four files touched: three new, one edited. All changes are additive.

| File | Action | Role |
|---|---|---|
| `src/lib/pipeline.ts` | new | Pure function `computeStages(result, profile): PipelineStage[]`. Exports `PipelineStage` type. No JSX. |
| `src/components/PipelineDiagram.tsx` | new | Presentation-only. Takes `stages` prop, renders horizontal (≥md) / vertical (<md) strip of stage boxes with connector arrows. No knowledge of `ScanResult`. |
| `src/components/PipelineHeroCard.tsx` | new | Container. Reads `result` + `activeAgent`, calls `computeStages`, renders card shell + copy + `<PipelineDiagram>` + conditional claude.ai-vs-`WebFetch` note. |
| `src/app/page.tsx` | edit | Insert `<PipelineHeroCard result={displayResult} activeAgent={activeAgent} />` above `<DiagnosticHero />` in the scan-mode inner grid (line ~234 in the current file). |

No new dependencies. No API changes. No new state.

## Data model

```ts
// src/lib/pipeline.ts

export interface PipelineStage {
  /** Uppercase short label rendered at top of box (e.g. "FETCH HTML"). */
  label: string;
  /** Primary char count; null when stage is expressed in bytes or a range. */
  chars: number | null;
  /** Derived via tokensFromChars; null when tokensRange is set. */
  tokens: number | null;
  /** Token range, used for summarized "Main context" stage (100–300). */
  tokensRange?: [number, number];
  /** Raw bytes, used only for the Fetch stage to show pre-markdown size. */
  rawBytes?: number;
  /** One-line secondary description shown beneath the number. */
  note?: string;
  /** True when truncation bites at this stage. Renders red. */
  emphasize?: boolean;
}

export function computeStages(
  result: ScanResult,
  profile: AgentProfile,
): PipelineStage[];
```

**Stage composition by delivery mode:**

- **Summarized** (`claude-code`) → 4 stages:
  1. `FETCH HTML` — `rawBytes: human.bytes`, note `"raw"`
  2. `MARKDOWN` — `chars: markdownBytes`, `tokens` derived
  3. `` `HAIKU CAP (${Math.round(cap/1000)}K)` `` — `chars: min(cap, markdownBytes)`, `emphasize` when truncated, note `"${pct}% of page"` when truncated else `"full page"`
  4. `MAIN CONTEXT` — `tokensRange: [SUMMARIZED_MAIN_CONTEXT_TOKENS.low, .high]`, note `"Haiku's distilled answer"`

- **Direct, capped** (`cursor`, `mcp-default`, `claude-api`) → 3 stages:
  1. `FETCH HTML` — as above
  2. `MARKDOWN` — as above
  3. `` `MAIN CONTEXT (${Math.round(cap/1000)}K cap)` `` — `chars: min(cap, markdownBytes)`, `emphasize` when truncated, note `"${pct}% of page"` when truncated else `"full page read"`

- **Direct, uncapped** (`copilot`) → 3 stages:
  1. `FETCH HTML` — as above
  2. `MARKDOWN` — as above
  3. `MAIN CONTEXT (no cap)` — `chars: markdownBytes`, `emphasize: false`, note `"full page read"`

All inputs already exist in `ScanResult.human.bytes`, `ScanResult.agent.markdownBytes`, `AGENT_LABELS[profile].cap`, `AGENT_LABELS[profile].deliveryMode`, `SUMMARIZED_MAIN_CONTEXT_TOKENS`, and `tokensFromChars()`. No new scan-side work.

## UI

### Card shell

Uses the existing `.card` class with `p-6 md:p-8` to match `DiagnosticHero`'s density.

### Header

```
● PIPELINE   ← eyebrow: text-[11px] uppercase tracking-[0.1em] font-semibold text-ink/45
              with a 1.5×1.5 rounded-full bg-accent-bright dot

How ${AgentLabel} actually reads this page
              ← h2: h-section text-[22px] md:text-[26px] leading-tight

${subLead}    ← text-[13px] text-ink/55 mt-2
```

`subLead` by delivery mode:
- Summarized: `"Four stages. Your main conversation never sees the page itself — only Haiku's distilled answer, shaped by the fetch prompt."`
- Direct: `"Three stages. ${AgentLabel} reads the last box verbatim into the main conversation."`

### Diagram (`PipelineDiagram`)

Horizontal on `≥md`, vertical on `<md`.

Stage box:

```
rounded-xl2 border border-rule px-3 py-3 flex-1 min-w-0 bg-white

  ${label}                 ← text-[10.5px] uppercase tracking-[0.08em] text-ink/50 font-semibold
  ${primaryNumber}         ← mono text-[18px] font-semibold text-ink (larger)
  ${secondaryLine}         ← text-[11.5px] text-ink/55 mt-0.5
```

Primary number rules:
- `rawBytes` set → format as `1.27 MB` / `872 KB` / `4.2 KB` (auto-pick)
- `tokensRange` set → format as `100–300 tok`
- Else → `${tokens.toLocaleString()} tok` (primary) with `${chars.toLocaleString()} chars` as the secondary line

Emphasized stage (truncation bites):
- Override border/bg/text: `border-fail-ring/40 bg-fail-bg/40 text-red-700`
- Primary number color: `text-red-700`
- Secondary line color: `text-red-700/80`

Connector arrows:
- `≥md`: horizontal `→` between boxes, `text-ink/35 text-lg`, `aria-hidden`
- `<md`: vertical `↓` below each box (except the last), `text-ink/35`, `aria-hidden`

### Claude-Code-only disclaimer

Renders only when `activeAgent === "claude-code"`, below the diagram:

```
<div class="mt-5 p-4 rounded-xl2 border border-rule bg-paper-dim/50 text-[12.5px] text-ink/70 leading-relaxed">
  <strong class="text-ink">Not the same as claude.ai's <code>web_fetch</code>.</strong>
  That tool (server-side, Readability-extracted article body) and Claude Code's
  <code>WebFetch</code> (local Axios + Turndown, no extraction) produce very different
  output on the same URL — often by 10–100×. The numbers above are the real Claude
  Code path.
</div>
```

Inline `<code>` styling reuses the pattern in `DiagnosticHero`'s `renderInline`:
`mono text-[12.5px] px-1 py-px rounded bg-paper-dim text-ink/85`.

## Edge cases

| Case | Behavior |
|---|---|
| Fetch failed (`result.human.bytes === 0`) | Fetch stage renders its primary value as `—`; downstream stages still compute normally from `markdownBytes` (which will also be 0 or tiny). No red emphasis solely because of fetch failure — red is reserved for truncation. |
| Empty markdown (`markdownBytes === 0`) | Markdown stage shows `0 tok / 0 chars`; cap stage shows `0`; no emphasis. |
| Uncapped profile (Copilot) | 3 stages, last labeled `"MAIN CONTEXT (no cap)"`, shows full `markdownBytes`; never emphasized. |
| No truncation (`markdownBytes ≤ cap`) | Cap/main stage shows full `markdownBytes` value, `emphasize: false`. Secondary line: `"full page read"` (direct) or `"full page"` (summarized). |
| Truncation (`markdownBytes > cap`) | Cap/main stage shows `cap` value, `emphasize: true`. Secondary line: `"${pct}% of page"` where `pct = round((cap / markdownBytes) * 100)`. |
| Agent switch via `AgentStrip` | Card re-renders from the new `activeAgent` prop. No local state to reset. |
| Narrow viewport (`< md`) | Stages stack vertically; arrows become `↓`. Box content unchanged. |

## Scope limits (explicit non-scope for v1)

- Crawl mode does not render the card. The card only appears inside the scan-mode inner grid.
- No dismiss / collapse control.
- No per-URL dynamic copy beyond what falls out of `computeStages`. Copy is stable; numbers carry the specificity.
- No live call to Anthropic's `web_fetch`. The disclaimer describes the difference qualitatively.
- No change to `DiagnosticHero`, `AgentStrip`, `AgentPanel`, `ShareRow`, or any existing component. Card is a sibling, not a replacement.

## Testing

The project has no test runner today (`"lint": "eslint"` is the only script-level check). This spec does not add one.

**v1 QA plan** — `computeStages` is kept in its own file with explicit types so adding unit tests later is one command away. For this round:

Visual verification against the running dev server (http://localhost:3000) across four URL × profile combinations that collectively exercise every branch:

| URL | Agent profile | Exercises |
|---|---|---|
| `https://docs.stripe.com/api` | claude-code | summarized · truncation · disclaimer · red-emphasized Haiku cap |
| `https://docs.ekline.io` | claude-code | summarized · no truncation · disclaimer · unemphasized full-page |
| `https://docs.ekline.io` | cursor | direct · 28K cap · truncation emphasis |
| `https://docs.ekline.io` | copilot | direct · no cap · "no cap" label |

Lint (`npm run lint`) must pass before merging.

## Acceptance criteria

1. For every completed scan in scan mode, `PipelineHeroCard` renders above `DiagnosticHero` in the inner grid.
2. The diagram correctly shows 4 stages for `claude-code` and 3 stages for every other profile.
3. Switching the active agent in `AgentStrip` updates the card's pipeline stages without a page reload.
4. Truncation (`markdownBytes > cap`) paints the cap/main stage red using the existing `fail-bg` / `fail-ring` palette.
5. The `web_fetch` vs `WebFetch` disclaimer renders if and only if `activeAgent === "claude-code"`.
6. Crawl mode renders nothing new.
7. `npm run lint` passes; `next dev` serves the app without runtime errors across the four QA URL/profile combinations.

## References

- CTO-supplied replica: `webfetch.ts` (Axios + Turndown + Haiku sub-call, 100K char cap).
- claude.ai share sessions (URL confusion): `7f1651df-1426-4b15-9224-0def43bdc18e`, `42924dbd-2073-4161-a7d7-5bda8d1e668e`.
- Existing model: `src/lib/types.ts` (`DeliveryMode`, `AGENT_PROFILES`, `AGENT_LABELS`, `SUMMARIZED_MAIN_CONTEXT_TOKENS`, `tokensFromChars`).
- Measured gap on `docs.stripe.com/api`: `web_fetch` ≈ 1,474 chars / ~370 tokens vs docs-lens `WebFetch` simulation 196,119 chars / ~49K tokens — a ~133× discrepancy that motivates the explainer.
