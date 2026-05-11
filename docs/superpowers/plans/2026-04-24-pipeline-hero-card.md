# Pipeline Hero Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a hero-level, always-visible card above `DiagnosticHero` that renders a profile-aware pipeline diagram with this-scan numbers, plus a Claude-Code-only note disambiguating `web_fetch` from `WebFetch`.

**Architecture:** Three new files (one pure helper, two React components) plus a one-line insertion in the page root. Profile-aware: 4 stages for summarized delivery (Claude Code), 3 for direct (Cursor, MCP, Copilot, Claude API). All inputs already present in `ScanResult` + `AGENT_LABELS` + `SUMMARIZED_MAIN_CONTEXT_TOKENS`.

**Tech Stack:** Next.js 16 (App Router, Turbopack), React 19, TypeScript, Tailwind v4. No new dependencies.

**Spec:** `docs-lens-next/docs/superpowers/specs/2026-04-24-webfetch-confusion-explainer-design.md` (commit `1d65255`).

**Verification model:** The project has no test runner. Each task verifies via: (1) clean TypeScript compilation (`npx tsc --noEmit`), (2) clean lint (`npm run lint`), (3) clean Turbopack HMR (no new errors in `dev.log`), and (4) at the end, a visual QA checklist across four URL × profile combinations against the running dev server (`http://localhost:3000`).

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `docs-lens-next/src/lib/pipeline.ts` | create | Pure `computeStages(result, profile) → PipelineStage[]`. Exports `PipelineStage` type. No JSX. |
| `docs-lens-next/src/components/PipelineDiagram.tsx` | create | Dumb presentational. Takes `stages` prop, renders horizontal (≥md) / vertical (<md) strip with connector arrows. |
| `docs-lens-next/src/components/PipelineHeroCard.tsx` | create | Container. Pulls `activeAgent` from parent, calls `computeStages`, renders card shell + copy + `<PipelineDiagram>` + conditional Claude-Code disclaimer. |
| `docs-lens-next/src/app/page.tsx` | modify | Insert `<PipelineHeroCard />` above `<DiagnosticHero />` inside the scan-mode inner grid. |

Each file has one clear responsibility: data shaping, visualization, container/copy, and integration. Nothing else is touched.

---

## Precondition check

- [ ] **Step 0a: Ensure dev server is running**

Run: `cd docs-lens-next && ls .dev-pid 2>/dev/null && ps -p "$(cat .dev-pid)" >/dev/null 2>&1 && echo "dev-safe running" || ./scripts/dev-safe.sh`
Expected: `dev-safe running` or fresh start output with a dev PID. This ensures Turbopack HMR picks up each file change so we can watch `dev.log` as verification.

- [ ] **Step 0b: Baseline clean state**

Run: `cd docs-lens-next && npx tsc --noEmit && npm run lint`
Expected: both complete with exit code 0. This establishes a clean baseline so any errors encountered later are caused by our changes.

---

## Task 1: Create `src/lib/pipeline.ts`

**Files:**
- Create: `docs-lens-next/src/lib/pipeline.ts`

**What it does:** Exports a `PipelineStage` type and a pure `computeStages(result, profile)` function that returns 4 stages for summarized delivery and 3 for direct delivery. Handles every edge case listed in the spec (fetch failure, empty markdown, uncapped profiles, no truncation, truncation).

- [ ] **Step 1.1: Write the file**

Create `docs-lens-next/src/lib/pipeline.ts` with this exact content:

```ts
import {
  AGENT_LABELS,
  SUMMARIZED_MAIN_CONTEXT_TOKENS,
  tokensFromChars,
  type AgentProfile,
  type ScanResult,
} from "./types";

/**
 * One box in the pipeline diagram. The diagram component is dumb: it formats
 * whatever primary value is present (rawBytes > tokensRange > tokens) and
 * shows `note` as a secondary line. `emphasize` paints the stage red using
 * the existing fail-bg / fail-ring palette when truncation bites.
 */
export interface PipelineStage {
  label: string;
  chars: number | null;
  tokens: number | null;
  tokensRange?: [number, number];
  rawBytes?: number;
  note?: string;
  emphasize?: boolean;
}

/**
 * Derive the pipeline stages content passes through for a given agent.
 *
 * Summarized (Claude Code): Fetch → Markdown → Haiku cap → Main context
 * Direct capped (Cursor, MCP, Claude API): Fetch → Markdown → Main context (capped)
 * Direct uncapped (Copilot): Fetch → Markdown → Main context (no cap)
 */
export function computeStages(
  result: ScanResult,
  profile: AgentProfile,
): PipelineStage[] {
  const label = AGENT_LABELS[profile];
  const markdownBytes = result.agent.markdownBytes;
  const cap = label.cap;
  const capped = cap !== null && markdownBytes > cap;
  const visibleChars = cap === null ? markdownBytes : Math.min(cap, markdownBytes);
  const pct =
    markdownBytes === 0 ? 0 : Math.round((visibleChars / markdownBytes) * 100);

  const fetchStage: PipelineStage = {
    label: "FETCH HTML",
    chars: null,
    tokens: null,
    rawBytes: result.human.bytes,
    note: "raw",
  };

  const markdownStage: PipelineStage = {
    label: "MARKDOWN",
    chars: markdownBytes,
    tokens: tokensFromChars(markdownBytes),
    note: `${markdownBytes.toLocaleString()} chars`,
  };

  if (label.deliveryMode === "summarized") {
    const capK = cap === null ? 0 : Math.round(cap / 1000);
    const haikuStage: PipelineStage = {
      label: `HAIKU CAP (${capK}K)`,
      chars: visibleChars,
      tokens: tokensFromChars(visibleChars),
      note: capped ? `${pct}% of page` : "full page",
      emphasize: capped,
    };
    const mainStage: PipelineStage = {
      label: "MAIN CONTEXT",
      chars: null,
      tokens: null,
      tokensRange: [
        SUMMARIZED_MAIN_CONTEXT_TOKENS.low,
        SUMMARIZED_MAIN_CONTEXT_TOKENS.high,
      ],
      note: "Haiku's distilled answer",
    };
    return [fetchStage, markdownStage, haikuStage, mainStage];
  }

  // Direct delivery
  if (cap === null) {
    const mainStage: PipelineStage = {
      label: "MAIN CONTEXT (no cap)",
      chars: markdownBytes,
      tokens: tokensFromChars(markdownBytes),
      note: "full page read",
    };
    return [fetchStage, markdownStage, mainStage];
  }

  const capK = Math.round(cap / 1000);
  const mainStage: PipelineStage = {
    label: `MAIN CONTEXT (${capK}K cap)`,
    chars: visibleChars,
    tokens: tokensFromChars(visibleChars),
    note: capped ? `${pct}% of page` : "full page read",
    emphasize: capped,
  };
  return [fetchStage, markdownStage, mainStage];
}
```

- [ ] **Step 1.2: Type-check**

Run: `cd docs-lens-next && npx tsc --noEmit`
Expected: exit 0, no errors. If it fails with an "unused export" warning on `PipelineStage`, ignore — Task 2 imports it.

- [ ] **Step 1.3: Live-verify against running scan API**

The dev server should already be running. Run a live scan and feed the JSON through a one-liner that imports and runs `computeStages`:

```bash
cd docs-lens-next && curl -sS "http://localhost:3000/api/scan?url=https%3A%2F%2Fdocs.stripe.com%2Fapi&agent=claude-code" > /tmp/stripe-scan.json && npx tsx -e '
import { computeStages } from "./src/lib/pipeline.ts";
import fs from "node:fs";
const r = JSON.parse(fs.readFileSync("/tmp/stripe-scan.json", "utf8"));
for (const p of ["claude-code", "cursor", "mcp-default", "copilot", "claude-api"] as const) {
  console.log("---", p, "---");
  for (const s of computeStages(r, p)) console.log(s);
}
'
```

Expected output: 4 stages printed for `claude-code`, 3 stages for each of the others. The `claude-code` Haiku cap stage has `emphasize: true` (Stripe is ~196K chars vs 100K cap). The `copilot` main stage has label `"MAIN CONTEXT (no cap)"`. Every stage has a defined `label` field. If any stage is missing `chars`/`tokens`/`rawBytes`/`tokensRange`, something is wrong — re-check the function.

- [ ] **Step 1.4: Commit**

```bash
cd /Users/bipinrimal/Downloads/Ekline/ekline-prototypes-org && git add docs-lens-next/src/lib/pipeline.ts && git commit -m "$(cat <<'EOF'
feat(docs-lens-next): add computeStages pipeline derivation

Pure function returning ordered PipelineStage[] for a scan and agent
profile. Handles summarized delivery (4 stages: Fetch → Markdown →
Haiku cap → Main context) and direct delivery (3 stages, with
capped/uncapped variants). All inputs from existing ScanResult and
AGENT_LABELS. No new deps, no scan-side changes.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Expected: commit succeeds on branch `prototype/docs-lens-webfetch-fidelity`.

---

## Task 2: Create `src/components/PipelineDiagram.tsx`

**Files:**
- Create: `docs-lens-next/src/components/PipelineDiagram.tsx`

**What it does:** Dumb presentational component. Takes `stages: PipelineStage[]` and renders a horizontal strip on `≥md` viewports with `→` connector arrows, or a vertical stack with `↓` arrows on narrower viewports. Each stage box shows uppercase label, primary number (mono, bold), optional secondary note. Emphasized stages render with red border + bg + text using the existing fail-bg / fail-ring palette.

- [ ] **Step 2.1: Write the file**

Create `docs-lens-next/src/components/PipelineDiagram.tsx` with this exact content:

```tsx
"use client";
import { Fragment } from "react";
import type { PipelineStage } from "@/lib/pipeline";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "—";
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(2)} MB`;
  if (bytes >= 1_000) return `${(bytes / 1_000).toFixed(1)} KB`;
  return `${bytes} B`;
}

function formatTokens(n: number): string {
  if (n >= 1_000) return `${Math.round(n / 1_000)}K tok`;
  return `${n.toLocaleString()} tok`;
}

function StageBox({ stage }: { stage: PipelineStage }) {
  const tone = stage.emphasize
    ? "border-fail-ring/40 bg-fail-bg/40"
    : "border-rule bg-white";

  let primary = "—";
  if (stage.rawBytes !== undefined) primary = formatBytes(stage.rawBytes);
  else if (stage.tokensRange)
    primary = `${stage.tokensRange[0]}–${stage.tokensRange[1]} tok`;
  else if (stage.tokens !== null) primary = formatTokens(stage.tokens);

  const primaryColor = stage.emphasize ? "text-red-700" : "text-ink";
  const secondaryColor = stage.emphasize ? "text-red-700/80" : "text-ink/55";

  return (
    <div className={`rounded-xl2 border px-3 py-3 flex-1 min-w-0 ${tone}`}>
      <div className="text-[10.5px] uppercase tracking-[0.08em] text-ink/50 font-semibold truncate">
        {stage.label}
      </div>
      <div
        className={`mono text-[18px] font-semibold mt-1 truncate ${primaryColor}`}
      >
        {primary}
      </div>
      {stage.note && (
        <div className={`text-[11.5px] mt-0.5 truncate ${secondaryColor}`}>
          {stage.note}
        </div>
      )}
    </div>
  );
}

export function PipelineDiagram({ stages }: { stages: PipelineStage[] }) {
  return (
    <>
      {/* Horizontal layout on md and up */}
      <div className="hidden md:flex items-stretch gap-2">
        {stages.map((stage, i) => (
          <Fragment key={`md-${i}`}>
            <StageBox stage={stage} />
            {i < stages.length - 1 && (
              <span
                aria-hidden
                className="flex items-center text-ink/35 text-lg shrink-0"
              >
                →
              </span>
            )}
          </Fragment>
        ))}
      </div>
      {/* Vertical layout below md */}
      <div className="flex flex-col gap-2 md:hidden">
        {stages.map((stage, i) => (
          <Fragment key={`sm-${i}`}>
            <StageBox stage={stage} />
            {i < stages.length - 1 && (
              <span aria-hidden className="text-ink/35 text-center">
                ↓
              </span>
            )}
          </Fragment>
        ))}
      </div>
    </>
  );
}
```

- [ ] **Step 2.2: Type-check and lint**

Run: `cd docs-lens-next && npx tsc --noEmit && npm run lint`
Expected: both exit 0. Turbopack HMR will compile the new file when it's imported in Task 3; right now it's an orphan and that's fine.

- [ ] **Step 2.3: Commit**

```bash
cd /Users/bipinrimal/Downloads/Ekline/ekline-prototypes-org && git add docs-lens-next/src/components/PipelineDiagram.tsx && git commit -m "$(cat <<'EOF'
feat(docs-lens-next): add PipelineDiagram presentational component

Renders PipelineStage[] horizontally on md+ and vertically below with
connector arrows. Emphasized stages paint red using the existing
fail-bg / fail-ring palette. No state, no data coupling — consumers
pass a stages array and the component renders it.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Expected: commit succeeds.

---

## Task 3: Create `src/components/PipelineHeroCard.tsx`

**Files:**
- Create: `docs-lens-next/src/components/PipelineHeroCard.tsx`

**What it does:** Container component. Takes `result: ScanResult` and `activeAgent: AgentProfile` as props, derives stages via `computeStages`, renders the card shell with eyebrow + H2 + sub-lead + `<PipelineDiagram>`, and conditionally renders the `web_fetch` vs `WebFetch` disclaimer when `activeAgent === "claude-code"`.

- [ ] **Step 3.1: Write the file**

Create `docs-lens-next/src/components/PipelineHeroCard.tsx` with this exact content:

```tsx
"use client";
import type { AgentProfile, ScanResult } from "@/lib/types";
import { AGENT_LABELS } from "@/lib/types";
import { computeStages } from "@/lib/pipeline";
import { PipelineDiagram } from "./PipelineDiagram";

interface Props {
  result: ScanResult;
  activeAgent: AgentProfile;
}

export function PipelineHeroCard({ result, activeAgent }: Props) {
  const label = AGENT_LABELS[activeAgent];
  const stages = computeStages(result, activeAgent);
  const isSummarized = label.deliveryMode === "summarized";
  const isClaudeCode = activeAgent === "claude-code";

  const subLead = isSummarized
    ? "Four stages. Your main conversation never sees the page itself — only Haiku's distilled answer, shaped by the fetch prompt."
    : `Three stages. ${label.label} reads the last box verbatim into the main conversation.`;

  return (
    <section className="card p-6 md:p-8">
      <header className="mb-5">
        <div className="flex items-center gap-2 mb-2 text-[11px] uppercase tracking-[0.1em] text-ink/45 font-semibold">
          <span className="w-1.5 h-1.5 rounded-full bg-accent-bright" />
          Pipeline
        </div>
        <h2 className="h-section text-[22px] md:text-[26px] leading-tight">
          How {label.label} actually reads this page
        </h2>
        <p className="text-[13px] text-ink/55 mt-2">{subLead}</p>
      </header>
      <PipelineDiagram stages={stages} />
      {isClaudeCode && (
        <div className="mt-5 p-4 rounded-xl2 border border-rule bg-paper-dim/50 text-[12.5px] text-ink/70 leading-relaxed">
          <strong className="text-ink">
            Not the same as claude.ai&apos;s{" "}
            <code className="mono text-[12.5px] px-1 py-px rounded bg-paper-dim text-ink/85">
              web_fetch
            </code>
            .
          </strong>{" "}
          That tool (server-side, Readability-extracted article body) and Claude
          Code&apos;s{" "}
          <code className="mono text-[12.5px] px-1 py-px rounded bg-paper-dim text-ink/85">
            WebFetch
          </code>{" "}
          (local Axios + Turndown, no extraction) produce very different output on
          the same URL — often by 10–100×. The numbers above are the real Claude
          Code path.
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 3.2: Type-check and lint**

Run: `cd docs-lens-next && npx tsc --noEmit && npm run lint`
Expected: both exit 0. The component is still an orphan (not mounted anywhere), so Turbopack won't evaluate it at runtime yet.

- [ ] **Step 3.3: Commit**

```bash
cd /Users/bipinrimal/Downloads/Ekline/ekline-prototypes-org && git add docs-lens-next/src/components/PipelineHeroCard.tsx && git commit -m "$(cat <<'EOF'
feat(docs-lens-next): add PipelineHeroCard container component

Renders the card shell (eyebrow, H2, sub-lead copy, PipelineDiagram) and
the Claude-Code-only disclaimer clarifying that claude.ai's server-side
web_fetch is a different tool than Claude Code's local WebFetch. Takes
result + activeAgent, delegates stage math to computeStages and rendering
to PipelineDiagram.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Expected: commit succeeds.

---

## Task 4: Wire `PipelineHeroCard` into `src/app/page.tsx`

**Files:**
- Modify: `docs-lens-next/src/app/page.tsx`

**What it does:** Adds the import and mounts `<PipelineHeroCard>` immediately above `<DiagnosticHero>` inside the scan-mode inner grid. This is the one place that activates the whole feature.

- [ ] **Step 4.1: Add the import**

In `docs-lens-next/src/app/page.tsx`, add this line to the import block (grouped with the other `@/components/...` imports, alphabetically between `HumanPanel` and `ShareRow`):

```tsx
import { PipelineHeroCard } from "@/components/PipelineHeroCard";
```

Exact edit — replace:

```tsx
import { URLInput } from "@/components/URLInput";
import { HumanPanel } from "@/components/HumanPanel";
import { AgentPanel } from "@/components/AgentPanel";
import { DiagnosticHero } from "@/components/DiagnosticHero";
import { AgentStrip } from "@/components/AgentStrip";
```

with:

```tsx
import { URLInput } from "@/components/URLInput";
import { HumanPanel } from "@/components/HumanPanel";
import { AgentPanel } from "@/components/AgentPanel";
import { DiagnosticHero } from "@/components/DiagnosticHero";
import { AgentStrip } from "@/components/AgentStrip";
import { PipelineHeroCard } from "@/components/PipelineHeroCard";
```

- [ ] **Step 4.2: Mount the component above DiagnosticHero**

Find the scan-mode inner grid. Replace:

```tsx
              <div className="space-y-5 min-w-0">
                <DiagnosticHero result={displayResult} />
                <AgentStrip result={displayResult} active={activeAgent} onPick={recomputeAgent} />
```

with:

```tsx
              <div className="space-y-5 min-w-0">
                <PipelineHeroCard result={displayResult} activeAgent={activeAgent} />
                <DiagnosticHero result={displayResult} />
                <AgentStrip result={displayResult} active={activeAgent} onPick={recomputeAgent} />
```

- [ ] **Step 4.3: Type-check, lint, and watch dev.log**

Run: `cd docs-lens-next && npx tsc --noEmit && npm run lint`
Expected: both exit 0.

Then check Turbopack HMR picked up the change without errors:

```bash
tail -30 docs-lens-next/dev.log | grep -vE "^\[watchdog"
```

Expected: no `Error:` / `error TS` lines from the latest recompile. If anything is off, fix before continuing.

- [ ] **Step 4.4: Smoke-test the scan page**

```bash
curl -sS --max-time 15 -o /dev/null -w "HTTP %{http_code} in %{time_total}s\n" "http://localhost:3000/?url=https%3A%2F%2Fdocs.ekline.io&agent=claude-code"
```

Expected: `HTTP 200 in <2s`. This also triggers a real render of the new card in SSR output.

Then inspect the raw HTML for card markers:

```bash
curl -sS --max-time 15 "http://localhost:3000/?url=https%3A%2F%2Fdocs.ekline.io&agent=claude-code" | grep -oE "Pipeline|How Claude Code actually reads|web_fetch|WebFetch" | sort -u
```

Expected: at least `Pipeline`, `How Claude Code actually reads`, `web_fetch`, `WebFetch` present. If any are missing, the component didn't mount — re-check Step 4.2.

- [ ] **Step 4.5: Commit**

```bash
cd /Users/bipinrimal/Downloads/Ekline/ekline-prototypes-org && git add docs-lens-next/src/app/page.tsx && git commit -m "$(cat <<'EOF'
feat(docs-lens-next): mount PipelineHeroCard above DiagnosticHero

Hero-level, always-visible pipeline explainer now renders for every
completed scan. Reuses existing activeAgent state from AgentStrip's
recomputeAgent callback; the card re-renders on profile switch.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Expected: commit succeeds.

---

## Task 5: Visual QA across four URL × profile combinations

**Files:** (none modified; pure verification)

**What it does:** Exercises every branch of `computeStages` and every UI code path in the card against the running dev server. Confirms the spec's acceptance criteria.

- [ ] **Step 5.1: QA matrix — execute each row**

| # | URL | Profile | Expected on page |
|---|---|---|---|
| 1 | `https://docs.stripe.com/api` | `claude-code` | Eyebrow "Pipeline" · H2 "How Claude Code actually reads this page" · 4 stages · Haiku Cap box painted red with "51% of page" (or near) · disclaimer block visible mentioning `web_fetch` and `WebFetch` |
| 2 | `https://docs.ekline.io` | `claude-code` | Same shape as #1 but Haiku Cap box is NOT red, secondary reads "full page" · disclaimer still visible |
| 3 | `https://docs.ekline.io` | `cursor` | H2 "How Cursor (WebFetch MCP) actually reads this page" · **3** stages · Main Context (28K cap) box NOT red (10.9K < 28K) · secondary reads "full page read" · **no disclaimer** |
| 4 | `https://docs.ekline.io` | `copilot` | H2 "How GitHub Copilot actually reads this page" · 3 stages · last box labeled "MAIN CONTEXT (no cap)" · secondary reads "full page read" · **no disclaimer** |

For each row:
1. Open `http://localhost:3000/?url=<url-encoded>&agent=<profile>` in a browser (or run the curl below).
2. Confirm the expected on-page text appears.
3. Tick the row's checkbox only after visual confirmation.

Curl helper that prints the differentiating strings per row (use to confirm SSR output if you can't open a browser):

```bash
for row in \
  "stripe|https%3A%2F%2Fdocs.stripe.com%2Fapi|claude-code" \
  "ekline-cc|https%3A%2F%2Fdocs.ekline.io|claude-code" \
  "ekline-cursor|https%3A%2F%2Fdocs.ekline.io|cursor" \
  "ekline-copilot|https%3A%2F%2Fdocs.ekline.io|copilot"; do
  name="${row%%|*}"; rest="${row#*|}"; url="${rest%%|*}"; agent="${rest##*|}"
  echo "=== $name ($agent) ==="
  curl -sS --max-time 20 "http://localhost:3000/?url=$url&agent=$agent" | \
    grep -oE "How [A-Za-z() ]+ actually reads|MAIN CONTEXT \\([^)]+\\)|HAIKU CAP \\([0-9]+K\\)|web_fetch|WebFetch|full page read|full page|[0-9]+% of page" | sort -u
  echo
done
```

Expected printed markers per row:

- **stripe (claude-code)** — `How Claude Code actually reads`, `HAIKU CAP (100K)`, some `X% of page` number, `web_fetch`, `WebFetch`, `Not the same as`
- **ekline-cc (claude-code)** — `How Claude Code actually reads`, `HAIKU CAP (100K)`, `full page`, `web_fetch`, `WebFetch`
- **ekline-cursor (cursor)** — `How Cursor (WebFetch MCP) actually reads`, `MAIN CONTEXT (28K cap)`, `full page read`, **no** `web_fetch`
- **ekline-copilot (copilot)** — `How GitHub Copilot actually reads`, `MAIN CONTEXT (no cap)`, `full page read`, **no** `web_fetch`

If any row doesn't match, the bug is in that row's profile branch of `computeStages` or in the conditional-disclaimer logic of `PipelineHeroCard`. Fix before moving on.

- [ ] **Step 5.2: Final lint + type-check + dev.log sweep**

```bash
cd docs-lens-next && npx tsc --noEmit && npm run lint && grep -E "Error|error TS" dev.log | tail -20
```

Expected: `tsc` and `lint` exit 0. The grep should show no lines from the current session, or only lines that predate this branch's work.

- [ ] **Step 5.3: Commit (only if any QA fixes were needed in Step 5.1)**

If Step 5.1 surfaced a bug and you patched code, commit it with the scope of what you fixed. If no fixes were needed, skip this step — the feature is fully shipped at commit #4.

---

## Self-review checklist (run after writing the plan — already done)

**Spec coverage:**
- Architecture (4 files, 3 new) → Tasks 1–4 ✓
- `PipelineStage` type + `computeStages` → Task 1 ✓
- `PipelineDiagram` horizontal/vertical + emphasize → Task 2 ✓
- `PipelineHeroCard` container + copy + conditional disclaimer → Task 3 ✓
- `page.tsx` insertion point → Task 4 ✓
- Edge cases (fetch failure, empty md, uncapped, truncation, no truncation) → exercised in Task 1 code paths and QA matrix Task 5 ✓
- Acceptance criteria 1–7 from spec → Task 5 matrix covers 1 (mounts above DiagnosticHero), 2 (4 vs 3 stages), 3 (agent switch recomputes — implicit, since the same URL param shows different agents), 4 (truncation emphasis), 5 (disclaimer conditional), 6 (crawl mode unaffected — no change to crawl code), 7 (lint + dev server serve). Row 2 and rows 3–4 also prove no-truncation case for summarized and direct respectively. ✓
- Crawl mode unchanged → no task touches crawl code ✓

**Placeholders:** none found — every step has exact content.

**Type consistency:** `PipelineStage` defined in Task 1 and imported unchanged in Tasks 2, 3; `computeStages` signature `(result, profile)` consistent between definition and call sites; `AGENT_LABELS[activeAgent].cap` vs `label.cap` resolved to the same thing; `AgentProfile` and `ScanResult` imported from `@/lib/types` consistently.
