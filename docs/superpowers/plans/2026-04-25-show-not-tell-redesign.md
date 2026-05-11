# "Show, not tell" redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the docs-lens diagnostic UI as crawl-only with three "show, not tell" axis demo cards (HTTP probe panel, answer-engine card preview, byte composition + content-start strips), driven entirely by deterministic per-URL measurements. Drop the misleading 5-profile abstraction and the just-shipped Pipeline Hero Card.

**Architecture:** Phased refactor — strip the single-URL surface first, then additively introduce new types and demo data, then build/wire the three new card components, then prune deprecated types, and finally render the accuracy disclaimer. The 28 existing deterministic checks keep running and feeding the score; the redesign changes how their outputs are presented, not how they are computed.

**Tech Stack:** Next.js 16 (App Router, Turbopack), React 19, TypeScript 5, Tailwind v4. No new dependencies.

**Spec:** `docs-lens-next/docs/superpowers/specs/2026-04-25-show-not-tell-redesign-design.md` (commit `c0203a7`).

**Verification model:** No test runner. Each task verifies via (1) `npx tsc --noEmit`, (2) `npm run lint` (must not exceed 16-error pre-existing baseline), (3) tail of `dev.log` for Turbopack HMR errors, and at the end (4) a four-URL browser QA matrix.

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `src/app/page.tsx` | modify | Crawl-only entry surface; mount `<CrawlForm>`, edge-to-edge preview, results, footer disclaimer. |
| `src/components/CrawlView.tsx` | modify | `CrawlForm` loses agent dropdown; `CrawlResults` keeps shape but consumes redesigned axis cards via `DiagnosticHero`. |
| `src/components/DiagnosticHero.tsx` | modify | Replace per-axis paragraph rendering with three demo card components. Drill-down expansion stays. |
| `src/lib/scan.ts` | modify | Populate `result.axisData` from existing check results + budget + content-start. Drop `allAgentScores` and `agentProfile`. |
| `src/lib/crawl.ts` | modify | Aggregate per-page `axisData` into site-wide `observation.axisData`. Drop `agentProfile` from public API. |
| `src/lib/observations.ts` | modify | Output `{axis, tone, headline, fix?, axisData, topFindings}`; delete all paragraph generation and metaphor copy. |
| `src/lib/types.ts` | modify | Remove `AgentProfile` / `AGENT_LABELS` / `AGENT_PROFILES` / `DeliveryMode` / `SUMMARIZED_MAIN_CONTEXT_TOKENS`; add `ProbeResult` / `MetaCardData` / `AgentRetrievalData` / `GeoData` / `ContextData`; update `ScanResult`, `SiteObservation`, `CrawlResult`. |
| `src/hooks/useCrawlStream.ts` | modify | Drop `agent` parameter from `run`. |
| `src/components/axis/AgentRetrievalCard.tsx` | create | HTTP probe results panel. |
| `src/components/axis/GeoCard.tsx` | create | Meta-card preview rendered from real metadata. |
| `src/components/axis/ContextCard.tsx` | create | Byte composition + content-start strips. |
| `src/components/AccuracyDisclaimer.tsx` | create | Footer paragraph stating measurement scope. |
| `src/components/PipelineHeroCard.tsx` | delete | Just-shipped hero, contradicts itself; superseded by axis cards. |
| `src/components/PipelineDiagram.tsx` | delete | Only consumed by PipelineHeroCard. |
| `src/lib/pipeline.ts` | delete | Only consumed by PipelineHeroCard. |
| `src/components/AgentStrip.tsx` | delete | 5-profile selector; not honest about per-tool measurement. |
| `src/components/URLInput.tsx` | delete | Single-URL form; mode removed. |
| `src/hooks/useScan.ts` | delete | Single-URL hook. |
| `src/hooks/useScanStream.ts` | delete | Single-URL streaming hook. |
| `src/lib/scan-stream.ts` | delete | Used only by single-URL stream endpoint. |
| `src/app/api/scan/route.ts` | delete | Single-URL HTTP endpoint. |
| `src/app/api/scan/stream/route.ts` | delete | Single-URL streaming endpoint. |

8 files modified, 4 new, 10 deleted.

---

## Precondition

- [ ] **Step 0a: Dev server running**

```bash
cd /Users/bipinrimal/Downloads/Ekline/ekline-prototypes-org/docs-lens-next && \
  ls .dev-pid 2>/dev/null && ps -p "$(cat .dev-pid)" >/dev/null 2>&1 && echo "dev-safe running" || ./scripts/dev-safe.sh
```
Expected: `dev-safe running` or fresh start output.

- [ ] **Step 0b: Baseline state**

```bash
cd /Users/bipinrimal/Downloads/Ekline/ekline-prototypes-org/docs-lens-next && \
  npx tsc --noEmit && \
  npm run lint 2>&1 | grep -oE "[a-zA-Z-]+/[a-zA-Z-]+$" | sort | uniq -c | sort -rn
```
Expected: tsc exit 0; lint counts at zero (since previous PR fixed all 16 baseline errors). Any new lint errors introduced by this redesign must be fixed before commit.

- [ ] **Step 0c: Branch check**

```bash
cd /Users/bipinrimal/Downloads/Ekline/ekline-prototypes-org && \
  git branch --show-current
```
Expected: `prototype/docs-lens-webfetch-fidelity`. All work below extends the same branch.

---

## Task 1: Strip `page.tsx` to crawl-only entry surface

**Files:**
- Modify: `docs-lens-next/src/app/page.tsx`

**What it does:** Removes the single-URL "scan" mode entirely from the page root. Removes the mode tab strip, the URL-input form, the auto-scan-from-URL effect, the `displayResult` / `activeAgent` state, the `recomputeAgent` callback, and every `mode === "scan"` JSX branch. Keeps only the crawl flow. Updates `EmptyState` copy to match a crawl-only product. After this task `URLInput`, `AgentStrip`, `useScan*`, `useScanStream`, and `PipelineHeroCard` become unimported; deletion happens in Task 3.

- [ ] **Step 1.1: Replace the entire file**

Overwrite `docs-lens-next/src/app/page.tsx` with this exact content:

```tsx
"use client";

import { useCallback } from "react";
import Link from "next/link";
import { HumanPanel } from "@/components/HumanPanel";
import { AgentPanel } from "@/components/AgentPanel";
import { CrawlLog } from "@/components/CrawlLog";
import { HistorySidebar } from "@/components/HistorySidebar";
import { CrawlForm, CrawlResults } from "@/components/CrawlView";
import { AccuracyDisclaimer } from "@/components/AccuracyDisclaimer";
import { useCrawlStream } from "@/hooks/useCrawlStream";
import { useHistory } from "@/hooks/useHistory";

export default function Page() {
  const {
    result: crawlResult,
    seedScan: crawlSeedScan,
    totalPages: crawlTotal,
    donePages: crawlDone,
    log: crawlLog,
    loading: crawlLoading,
    error: crawlError,
    run: runCrawl,
  } = useCrawlStream();
  const { history, add: _addHistory, clear: clearHistory } = useHistory();

  const startScan = useCallback(
    (url: string) => {
      runCrawl(url, 8);
    },
    [runCrawl],
  );
  void _addHistory;

  return (
    <div className="min-h-screen flex flex-col bg-paper">
      <section className="bg-paper-dim/50 border-b border-rule">
        <div className="max-w-[1200px] mx-auto px-6 py-3 flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2.5">
            <span className="text-[15px] font-bold tracking-tight h-navy">Docs Lens</span>
            <span className="hidden lg:inline text-[11.5px] text-ink/50 ml-1">
              see what agents, answer engines, and context windows read
            </span>
          </div>
          <div className="flex items-center gap-1.5 ml-auto">
            <Link href="/methodology" className="nav-link hidden sm:inline">
              Methodology
            </Link>
          </div>
        </div>
      </section>

      <section className="px-6 py-6 bg-paper">
        <div className="max-w-[1200px] mx-auto">
          <CrawlForm
            loading={crawlLoading}
            error={crawlError}
            totalPages={crawlTotal}
            donePages={crawlDone}
            onCrawl={(u, m) => runCrawl(u, m)}
          />
        </div>
      </section>

      <main className="flex-1 flex flex-col">
        {(crawlLoading || crawlSeedScan) && (
          <section className="grid grid-cols-1 md:grid-cols-2 border-y border-rule h-[56vh] min-h-[460px]">
            <div className="border-r border-rule min-w-0 min-h-0">
              {crawlSeedScan ? (
                <HumanPanel result={crawlSeedScan} />
              ) : (
                <LoadingPanel label="What you see" />
              )}
            </div>
            <div className="min-w-0 min-h-0">
              {crawlSeedScan ? (
                <AgentPanel result={crawlSeedScan} />
              ) : (
                <LoadingPanel label="What the agent gets" dark />
              )}
            </div>
          </section>
        )}

        {!crawlLoading && !crawlResult && crawlLog.length === 0 && <EmptyState />}

        {(crawlResult || crawlLog.length > 0) && (
          <section className="px-6 py-8 bg-paper-dim/40">
            <div className="max-w-[1200px] mx-auto grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6">
              <div className="min-w-0 space-y-6">
                {crawlResult && <CrawlResults result={crawlResult} />}
                {crawlLog.length > 0 && (
                  <CrawlLog
                    log={crawlLog}
                    active={crawlLoading}
                    total={crawlTotal}
                    done={crawlDone}
                  />
                )}
              </div>
              <div className="space-y-5 lg:sticky lg:top-4 lg:self-start">
                <HistorySidebar history={history} onPick={(u) => startScan(u)} onClear={clearHistory} />
                <MethodologyBlurb />
              </div>
            </div>
          </section>
        )}
      </main>

      <AccuracyDisclaimer />
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex-1 flex items-center justify-center px-6 py-20">
      <div className="text-center max-w-3xl">
        <div className="inline-flex items-center gap-2 chip mb-6">
          <span className="w-1.5 h-1.5 rounded-full bg-accent-bright animate-pulse" />
          Live, deterministic crawl. No LLMs.
        </div>
        <h2 className="h-display h-navy text-[44px] md:text-[60px] leading-[1.02] mb-5">
          See what your docs look like{" "}
          <span className="text-coral">through an agent&apos;s eyes.</span>
        </h2>
        <p className="text-[17px] text-ink/65 leading-relaxed max-w-2xl mx-auto">
          Paste a docs URL above. Docs Lens crawls a few pages and shows you what an
          agent, an answer engine, and a context window each see, with the actual probes
          and bytes behind every reading.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3 text-[12.5px] text-ink/45">
          <span className="flex items-center gap-1.5">
            <span className="w-1 h-1 rounded-full bg-ink/30" />
            Agent Retrieval
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-1 h-1 rounded-full bg-ink/30" />
            Generative Engine Optimization
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-1 h-1 rounded-full bg-ink/30" />
            Context Management
          </span>
        </div>
      </div>
    </div>
  );
}

function LoadingPanel({ label, dark = false }: { label: string; dark?: boolean }) {
  return (
    <div
      className={`h-full w-full flex items-center justify-center ${
        dark ? "bg-agent-bg text-agent-muted" : "bg-white text-ink/40"
      }`}
    >
      <div className="text-center">
        <div className="text-[11px] uppercase tracking-[0.12em] font-medium">{label}</div>
        <div className="mt-3 flex items-center justify-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-accent-bright animate-pulse" />
          <span className="w-2 h-2 rounded-full bg-accent-bright animate-pulse" style={{ animationDelay: "150ms" }} />
          <span className="w-2 h-2 rounded-full bg-accent-bright animate-pulse" style={{ animationDelay: "300ms" }} />
        </div>
      </div>
    </div>
  );
}

function MethodologyBlurb() {
  return (
    <aside className="card p-5 text-[12.5px] text-ink/65 leading-relaxed">
      <div className="flex items-center gap-2 mb-2">
        <span className="w-1.5 h-1.5 rounded-full bg-accent-bright" />
        <h3 className="text-[12.5px] font-semibold text-ink uppercase tracking-[0.08em]">
          How this works
        </h3>
      </div>
      <p>
        We fetch each page once over HTTP, run 28 deterministic checks across three
        readers (coding agents, answer engines, context windows), and tell you what
        each one found. No model calls in the scoring path.
      </p>
      <p className="mt-3">
        <Link className="btn-link" href="/methodology">
          Read the full methodology →
        </Link>
      </p>
      <p className="mt-4 pt-3 border-t border-rule text-ink/45 text-[11px]">
        Made by{" "}
        <a
          className="underline decoration-dotted hover:text-accent text-ink/70"
          href="https://ekline.io"
          target="_blank"
          rel="noreferrer"
        >
          EkLine
        </a>
        .
      </p>
    </aside>
  );
}
```

This file imports `AccuracyDisclaimer` (created in Task 10) and assumes `CrawlForm` accepts `(url, max)` not `(url, agent, max)` (changed in Task 2). After this step Turbopack will fail to compile until those two land. **Do not commit until Task 2 finishes.**

- [ ] **Step 1.2: Verify the changes are saved correctly**

```bash
cd docs-lens-next && head -20 src/app/page.tsx | grep -E "^import"
```
Expected: imports include `AccuracyDisclaimer`, no longer include `URLInput`, `AgentStrip`, `PipelineHeroCard`, `useScanStream`, `ScanResult`, `AgentProfile`.

Do **not** run `npx tsc --noEmit` yet — it will fail because `AccuracyDisclaimer` and the new `CrawlForm` signature don't exist. Move directly to Task 2.

---

## Task 2: Strip `CrawlForm` agent dropdown + drop `agent` from `useCrawlStream`

**Files:**
- Modify: `docs-lens-next/src/components/CrawlView.tsx` (top of file, `CrawlForm` component only)
- Modify: `docs-lens-next/src/hooks/useCrawlStream.ts`

**What it does:** Removes the agent profile dropdown and `agent` argument from `CrawlForm`. Updates `useCrawlStream.run` to drop the `agent` parameter. Both align with the new `(url, maxPages)` signature page.tsx now uses.

- [ ] **Step 2.1: Edit `CrawlForm` in `CrawlView.tsx`**

Open `docs-lens-next/src/components/CrawlView.tsx`. Replace the existing `interface CrawlFormProps` and `export function CrawlForm` (lines roughly 18–108 in the current file) with:

```tsx
interface CrawlFormProps {
  loading: boolean;
  error: string | null;
  onCrawl: (url: string, max: number) => void;
  totalPages?: number;
  donePages?: number;
}

/** Full-site crawl input form. Single entry surface for the app. */
export function CrawlForm({
  loading,
  error,
  onCrawl,
  totalPages = 0,
  donePages = 0,
}: CrawlFormProps) {
  const [url, setUrl] = useState("https://developers.cloudflare.com/workers/");
  const [max, setMax] = useState(8);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!loading) onCrawl(url.trim(), max);
      }}
      className="card p-5"
    >
      <div className="flex items-baseline justify-between mb-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.1em] font-semibold text-ink/45 mb-1">
            Full-site crawl
          </div>
          <h3 className="text-[15px] font-semibold tracking-tight">
            Sample up to N pages, get site-wide and per-page readings
          </h3>
        </div>
      </div>
      <div className="flex flex-col md:flex-row items-stretch gap-2 p-1.5 bg-white border border-rule rounded-full shadow-card focus-within:border-accent/40 focus-within:ring-2 focus-within:ring-accent/20 transition-shadow">
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="flex-1 bg-transparent border-0 outline-none px-4 py-2 mono text-[13.5px] text-ink placeholder-ink/30 min-w-0"
          required
          disabled={loading}
        />
        <input
          type="number"
          min={2}
          max={20}
          value={max}
          onChange={(e) => setMax(Number(e.target.value))}
          className="bg-transparent border-0 outline-none px-3 py-2 md:w-20 mono text-[13px] text-ink text-center"
          disabled={loading}
          title="Max pages to sample"
        />
        <button type="submit" className="btn-accent md:w-28" disabled={loading}>
          {loading ? (
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
              {totalPages > 0 ? `${donePages}/${totalPages}` : "Starting"}
            </span>
          ) : (
            <span>Crawl →</span>
          )}
        </button>
      </div>
      {error && (
        <div className="mt-3 text-sm text-red-700 bg-fail-bg p-2 rounded-xl2 ring-1 ring-fail-ring/30">
          {error}
        </div>
      )}
    </form>
  );
}
```

This removes the agent profile `<select>` and the `agent` state/argument. The `<input type="number">` slides up to sit directly between URL and Crawl button.

- [ ] **Step 2.2: Drop the unused `AGENT_LABELS` import in CrawlView.tsx**

At the top of `CrawlView.tsx`, change:

```tsx
import { AGENT_LABELS, AXIS_LABELS } from "@/lib/types";
```

to:

```tsx
import { AXIS_LABELS } from "@/lib/types";
```

Also drop the `AgentProfile` from the `import type` line if the only remaining use was the form. Search the file: `AgentProfile` should only have appeared in the now-removed `CrawlFormProps`. After this edit, `AgentProfile` should not appear anywhere in `CrawlView.tsx`.

- [ ] **Step 2.3: Edit `useCrawlStream.ts`**

Open `docs-lens-next/src/hooks/useCrawlStream.ts`. Find the public `run` callback (or whatever method `useCrawlStream` exposes for kicking off a crawl) and remove the `agent: AgentProfile` parameter. The function signature becomes `run(url: string, max: number): void`.

Inside `run`, where the SSE URL is built (likely something like `/api/crawl/stream?url=...&agent=...&max=...`), remove the `&agent=...` portion entirely. The crawl API still accepts `agent` as an ignored query param per spec, so omitting it from the URL is fine.

If the file imports `AgentProfile` and no other use remains, drop the import.

- [ ] **Step 2.4: Verify the build compiles**

```bash
cd docs-lens-next && npx tsc --noEmit 2>&1 | head -30
```
Expected: errors only about `AccuracyDisclaimer` not existing yet. No errors from `CrawlForm`, `useCrawlStream`, or `page.tsx`. If other errors appear, the imports likely still reference things that were removed; fix and re-run.

- [ ] **Step 2.5: Commit Tasks 1+2 together**

```bash
cd /Users/bipinrimal/Downloads/Ekline/ekline-prototypes-org && \
  git add docs-lens-next/src/app/page.tsx docs-lens-next/src/components/CrawlView.tsx docs-lens-next/src/hooks/useCrawlStream.ts && \
  git commit -m "$(cat <<'EOF'
refactor(docs-lens-next): collapse to crawl-only entry surface

Remove single-URL mode from page.tsx, the agent profile dropdown from
CrawlForm, and the agent parameter from useCrawlStream.run. Crawl is
now the sole entry point. EmptyState copy updated to match.

The references to AccuracyDisclaimer in page.tsx will fail to compile
until that component lands in a follow-up commit; this one stops at
type-check failures localized to the missing component.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

This commit will leave the build broken on `AccuracyDisclaimer`. That's intentional and gets fixed in Task 10. Subsequent tasks 3–9 work on parallel surfaces and don't need the page to render.

---

## Task 3: Delete the orphaned single-URL files

**Files (all to delete):**
- `docs-lens-next/src/components/PipelineHeroCard.tsx`
- `docs-lens-next/src/components/PipelineDiagram.tsx`
- `docs-lens-next/src/lib/pipeline.ts`
- `docs-lens-next/src/components/AgentStrip.tsx`
- `docs-lens-next/src/components/URLInput.tsx`
- `docs-lens-next/src/hooks/useScan.ts`
- `docs-lens-next/src/hooks/useScanStream.ts`
- `docs-lens-next/src/lib/scan-stream.ts`
- `docs-lens-next/src/app/api/scan/route.ts`
- `docs-lens-next/src/app/api/scan/stream/route.ts`

**What it does:** Now-orphaned files removed. After Task 1+2 these have zero imports anywhere. Removing them surfaces any lingering reference quickly via tsc.

- [ ] **Step 3.1: Verify no remaining imports**

```bash
cd docs-lens-next && \
  for f in PipelineHeroCard PipelineDiagram pipeline AgentStrip URLInput useScan useScanStream scan-stream; do
    matches=$(grep -rln "$f" src/ 2>/dev/null | grep -v "$f\." | head -3 || true)
    [ -n "$matches" ] && echo "REMAINING REF to $f in:" && echo "$matches"
  done
```
Expected: no output. If any path prints, that file still imports the to-be-deleted module — fix the consuming file before continuing.

- [ ] **Step 3.2: Delete all 10 files**

```bash
cd docs-lens-next && \
  rm -f \
    src/components/PipelineHeroCard.tsx \
    src/components/PipelineDiagram.tsx \
    src/lib/pipeline.ts \
    src/components/AgentStrip.tsx \
    src/components/URLInput.tsx \
    src/hooks/useScan.ts \
    src/hooks/useScanStream.ts \
    src/lib/scan-stream.ts \
    src/app/api/scan/route.ts \
    src/app/api/scan/stream/route.ts && \
  rmdir src/app/api/scan/stream src/app/api/scan 2>/dev/null || true
```

Empty directories `src/app/api/scan/stream` and `src/app/api/scan` are also removed if they end up empty.

- [ ] **Step 3.3: Verify type-check still has only the expected `AccuracyDisclaimer` failure**

```bash
cd docs-lens-next && npx tsc --noEmit 2>&1 | grep -E "error TS" | head -10
```
Expected: only one or two errors, all about `AccuracyDisclaimer` (the `Cannot find module '@/components/AccuracyDisclaimer'` error from `page.tsx`). No other type errors.

- [ ] **Step 3.4: Commit**

```bash
cd /Users/bipinrimal/Downloads/Ekline/ekline-prototypes-org && \
  git add -A docs-lens-next/src/ && \
  git commit -m "$(cat <<'EOF'
refactor(docs-lens-next): delete orphaned single-URL files

Removes 10 files now unreferenced after the crawl-only refactor:
  - PipelineHeroCard, PipelineDiagram, pipeline.ts (yesterday's hero)
  - AgentStrip (5-profile selector)
  - URLInput (single-URL form)
  - useScan, useScanStream, scan-stream lib
  - /api/scan and /api/scan/stream HTTP endpoints

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Add new types in `types.ts` (additive)

**Files:**
- Modify: `docs-lens-next/src/lib/types.ts`

**What it does:** Adds `ProbeResult`, `MetaCardData`, `AgentRetrievalData`, `GeoData`, `ContextData`. Adds `axisData` as an optional field on `ScanResult` and `SiteObservation` so existing consumers keep compiling. Final cleanup (removing `AGENT_LABELS`, etc., and making `axisData` required) happens in Task 10 once all consumers are migrated.

- [ ] **Step 4.1: Append new type definitions**

Open `docs-lens-next/src/lib/types.ts`. At the end of the file, append:

```ts
// ---------- Axis demo card data shapes (Task 4) ----------

/** Outcome of one HTTP probe shown in the Agent Retrieval card. */
export interface ProbeResult {
  /** "GET /llms.txt" or similar — display label for the row. */
  label: string;
  /** Plain status word: "200" | "404" | "html" | "none" | "error" | "empty". */
  statusText: string;
  /** Right-aligned secondary description, e.g. "3.2 KB · 38 link entries". */
  detail: string;
  /** Overall verdict for this probe. */
  pass: boolean;
}

export interface AgentRetrievalData {
  /** Exactly four probes, fixed order: llms.txt, page.md, Accept header, Content-Signals. */
  probes: ProbeResult[];
  /** Number of probes with pass === true (0..4). */
  passingCount: number;
}

export interface MetaCardData {
  domain: string;
  title: string | null;
  description: string | null;
  canonicalUrl: string | null;
  ogTitle: string | null;
  ogImageUrl: string | null;
  /** Count of non-null fields among title, description, canonical, ogTitle, ogImage (0..5). */
  presentCount: number;
}

export interface GeoData {
  card: MetaCardData;
}

export interface ContextData {
  htmlBytes: number;
  markdownBytes: number;
  /** Reuses ContentBudgetSegment from existing `agent.budget` shape. */
  budgetSegments: ContentBudgetSegment[];
  contentStartPct: number;
  /** Percent of total HTML bytes that are the "content" segment (0..100). */
  contentSharePct: number;
}

/** Bundle of all three axis demos for one scan. */
export interface AxisData {
  agent: AgentRetrievalData;
  geo: GeoData;
  context: ContextData;
}
```

- [ ] **Step 4.2: Add `axisData` as optional on `ScanResult`**

Find the `ScanResult` interface in `types.ts`. After the `checks: CheckResult[];` field, add:

```ts
  /** Axis demo card payload — populated by scan.ts. Optional during migration. */
  axisData?: AxisData;
```

- [ ] **Step 4.3: Add `axisData` as optional on `SiteObservation`**

Find the `SiteObservation` interface in `types.ts`. After the `tone: "clean" | "watch" | "concern";` field, add:

```ts
  /** Axis demo card payload — populated by crawl.ts aggregation. Optional during migration. */
  axisData?: AgentRetrievalData | GeoData | ContextData;
```

- [ ] **Step 4.4: Verify type-check**

```bash
cd docs-lens-next && npx tsc --noEmit 2>&1 | grep -cE "error TS"
```
Expected: same error count as after Task 3 — only the `AccuracyDisclaimer` missing-module error.

- [ ] **Step 4.5: Commit**

```bash
cd /Users/bipinrimal/Downloads/Ekline/ekline-prototypes-org && \
  git add docs-lens-next/src/lib/types.ts && \
  git commit -m "$(cat <<'EOF'
feat(docs-lens-next): add axis demo data type definitions

Additive types for the new "show, not tell" axis cards:
  - ProbeResult, AgentRetrievalData (HTTP probe panel payload)
  - MetaCardData, GeoData (answer-engine card preview)
  - ContextData (byte composition + content-start strip)
  - AxisData bundle

ScanResult.axisData and SiteObservation.axisData added as optional so
existing consumers keep compiling. Made required after migration.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Populate `axisData` in `scan.ts`

**Files:**
- Modify: `docs-lens-next/src/lib/scan.ts`

**What it does:** Adds a `buildAxisData` helper that derives `AgentRetrievalData`, `GeoData`, and `ContextData` from existing scan outputs (check results, fetched HTML, budget, content-start). Populates `result.axisData` before returning. No new fetches, no scan-pipeline restructuring.

- [ ] **Step 5.1: Add `buildAxisData` helper at the bottom of `scan.ts`**

At the end of `docs-lens-next/src/lib/scan.ts`, before the closing brace if any (or at the very bottom of the file), append:

```ts
import * as cheerio from "cheerio";
import type {
  AgentRetrievalData,
  AxisData,
  ContextData,
  GeoData,
  MetaCardData,
  ProbeResult,
} from "./types";

function fmtBytes(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)} MB`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)} KB`;
  return `${n} B`;
}

/** Find a check by its id, returning undefined if absent. */
function getCheck(checks: { id: string }[], id: string) {
  return checks.find((c) => c.id === id);
}

function buildAgentRetrievalData(
  checks: { id: string; severity: string; details?: Record<string, unknown> }[],
): AgentRetrievalData {
  const probes: ProbeResult[] = [];

  // Probe 1: /llms.txt
  const llms = getCheck(checks, "llms-txt-exists");
  if (llms) {
    const detailsObj = llms.details ?? {};
    const sizeBytes = typeof detailsObj.bytes === "number" ? detailsObj.bytes : null;
    const linkCount = typeof detailsObj.linkCount === "number" ? detailsObj.linkCount : null;
    const detail =
      sizeBytes && linkCount
        ? `${fmtBytes(sizeBytes)} · ${linkCount} link entries`
        : sizeBytes
          ? fmtBytes(sizeBytes)
          : "no body";
    probes.push({
      label: "GET /llms.txt",
      statusText: llms.severity === "pass" ? "200" : llms.severity === "warn" ? "200" : "404",
      detail,
      pass: llms.severity === "pass" || llms.severity === "warn",
    });
  } else {
    probes.push({
      label: "GET /llms.txt",
      statusText: "error",
      detail: "probe not run",
      pass: false,
    });
  }

  // Probe 2: <page>.md
  const mdUrl = getCheck(checks, "markdown-url-support");
  if (mdUrl) {
    const detailsObj = mdUrl.details ?? {};
    const sizeBytes = typeof detailsObj.bytes === "number" ? detailsObj.bytes : null;
    probes.push({
      label: "GET <page>.md",
      statusText: mdUrl.severity === "pass" ? "200" : "404",
      detail: sizeBytes ? `${fmtBytes(sizeBytes)} clean markdown` : mdUrl.severity === "pass" ? "served as markdown" : "no markdown variant",
      pass: mdUrl.severity === "pass",
    });
  } else {
    probes.push({
      label: "GET <page>.md",
      statusText: "error",
      detail: "probe not run",
      pass: false,
    });
  }

  // Probe 3: Accept: text/markdown
  const negotiation = getCheck(checks, "content-negotiation");
  if (negotiation) {
    const detailsObj = negotiation.details ?? {};
    const contentType =
      typeof detailsObj.contentType === "string" ? detailsObj.contentType : null;
    probes.push({
      label: "GET <page> · Accept: text/markdown",
      statusText:
        negotiation.severity === "pass"
          ? "md"
          : contentType?.includes("html")
            ? "html"
            : "fail",
      detail:
        negotiation.severity === "pass"
          ? "Content-Type: text/markdown"
          : `Content-Type: ${contentType ?? "html"} (not honored)`,
      pass: negotiation.severity === "pass",
    });
  } else {
    probes.push({
      label: "GET <page> · Accept: text/markdown",
      statusText: "error",
      detail: "probe not run",
      pass: false,
    });
  }

  // Probe 4: Content-Signals header in robots.txt
  const signals = getCheck(checks, "content-signals");
  if (signals) {
    probes.push({
      label: "GET /robots.txt · Content-Signals",
      statusText: signals.severity === "pass" ? "set" : "none",
      detail:
        signals.severity === "pass"
          ? "Content-Signals directive present"
          : "no Content-Signals header (defaults vary)",
      pass: signals.severity === "pass",
    });
  } else {
    probes.push({
      label: "GET /robots.txt · Content-Signals",
      statusText: "error",
      detail: "probe not run",
      pass: false,
    });
  }

  return {
    probes,
    passingCount: probes.filter((p) => p.pass).length,
  };
}

function buildGeoData(html: string, finalUrl: string): GeoData {
  const $ = cheerio.load(html);
  const title = $("title").first().text().trim() || null;
  const description = $('meta[name="description"]').attr("content")?.trim() || null;
  const canonicalUrl = $('link[rel="canonical"]').attr("href")?.trim() || null;
  const ogTitle = $('meta[property="og:title"]').attr("content")?.trim() || null;
  const ogImageUrl = $('meta[property="og:image"]').attr("content")?.trim() || null;

  let domain = "";
  try {
    domain = new URL(finalUrl).host;
  } catch {
    domain = finalUrl;
  }

  const card: MetaCardData = {
    domain,
    title,
    description,
    canonicalUrl,
    ogTitle,
    ogImageUrl,
    presentCount: [title, description, canonicalUrl, ogTitle, ogImageUrl].filter(
      (x) => x !== null,
    ).length,
  };

  return { card };
}

function buildContextData(
  htmlBytes: number,
  markdownBytes: number,
  budgetSegments: ContextData["budgetSegments"],
  contentStartPct: number,
): ContextData {
  const contentSeg = budgetSegments.find((s) => s.label === "content");
  const contentSharePct = contentSeg?.pct ?? 0;
  return {
    htmlBytes,
    markdownBytes,
    budgetSegments,
    contentStartPct,
    contentSharePct,
  };
}

export function buildAxisData(args: {
  checks: { id: string; severity: string; details?: Record<string, unknown> }[];
  html: string;
  finalUrl: string;
  htmlBytes: number;
  markdownBytes: number;
  budgetSegments: ContextData["budgetSegments"];
  contentStartPct: number;
}): AxisData {
  return {
    agent: buildAgentRetrievalData(args.checks),
    geo: buildGeoData(args.html, args.finalUrl),
    context: buildContextData(
      args.htmlBytes,
      args.markdownBytes,
      args.budgetSegments,
      args.contentStartPct,
    ),
  };
}
```

- [ ] **Step 5.2: Call `buildAxisData` inside the `scan` function and attach to result**

Find the `scan` function in `docs-lens-next/src/lib/scan.ts`. Just before the function returns its result object, add:

```ts
  const axisData = buildAxisData({
    checks: stampedChecks,
    html: fetched.body,
    finalUrl: fetched.finalUrl,
    htmlBytes: fetched.bytes,
    markdownBytes: markdown.length,
    budgetSegments: budget.segments,
    contentStartPct: startPct,
  });
```

Then in the returned object, add `axisData,` to the property list (alongside `pipeline`, `human`, `agent`, etc.). The exact insertion point is right after the `checks: stampedChecks,` line.

- [ ] **Step 5.3: Verify**

```bash
cd docs-lens-next && npx tsc --noEmit 2>&1 | grep -cE "error TS"
```
Expected: still only the `AccuracyDisclaimer` error from page.tsx — same as Task 4.

If new errors appear, common causes: missing `cheerio` import (already added at top of helper), missing `import` for ContextData (already in the helper), or ContextData.budgetSegments type mismatch (the existing `result.budget.segments` should be the same shape — they share `ContentBudgetSegment`).

- [ ] **Step 5.4: Sanity-check the new payload via the running dev server**

```bash
curl -sS --max-time 45 "http://localhost:3000/api/crawl/stream?url=https%3A%2F%2Fdocs.ekline.io&max=2" 2>/dev/null | grep -o '"axisData":{[^}]*}' | head -1
```
Expected: a JSON fragment showing the `axisData` key with `agent`, `geo`, `context` sub-objects. If the fragment is missing, `scan.ts` is not attaching it.

- [ ] **Step 5.5: Commit**

```bash
cd /Users/bipinrimal/Downloads/Ekline/ekline-prototypes-org && \
  git add docs-lens-next/src/lib/scan.ts && \
  git commit -m "$(cat <<'EOF'
feat(docs-lens-next): populate axisData on every scan

scan() now derives the three axis card payloads from existing check
results, fetched HTML, budget segments, and content-start position:
  - AgentRetrievalData: 4 probe rows (llms.txt, .md, Accept header,
    Content-Signals) sourced from the corresponding deterministic checks
  - GeoData: meta-card fields parsed from the fetched HTML's <meta> tags
  - ContextData: htmlBytes, markdownBytes, budgetSegments,
    contentStartPct, and contentSharePct

No new fetches, no new checks. The existing 28-check pipeline keeps
running and feeding the score; this layer reshapes its outputs into
typed display payloads.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Aggregate site-wide `axisData` in `crawl.ts`

**Files:**
- Modify: `docs-lens-next/src/lib/crawl.ts`

**What it does:** After all per-page scans complete, build site-wide axis data following the aggregation rules from the spec. Attach the per-axis aggregate to the corresponding `SiteObservation.axisData`.

- [ ] **Step 6.1: Add aggregator helpers at the bottom of `crawl.ts`**

At the very end of `docs-lens-next/src/lib/crawl.ts`, append:

```ts
import type {
  AgentRetrievalData,
  AxisData,
  ContextData,
  ContentBudgetSegment,
  GeoData,
  ScanResult,
} from "./types";

/** Aggregation rules per spec §Aggregation. */
function aggregateAgentRetrieval(seedScan: ScanResult): AgentRetrievalData {
  // Origin probes are site-level (llms.txt, robots.txt). .md and Accept
  // are per-page but show the seed page's result; per-page details remain
  // visible inside per-page expansions.
  return seedScan.axisData?.agent ?? {
    probes: [
      { label: "GET /llms.txt", statusText: "error", detail: "no scan", pass: false },
      { label: "GET <page>.md", statusText: "error", detail: "no scan", pass: false },
      { label: "GET <page> · Accept: text/markdown", statusText: "error", detail: "no scan", pass: false },
      { label: "GET /robots.txt · Content-Signals", statusText: "error", detail: "no scan", pass: false },
    ],
    passingCount: 0,
  };
}

function aggregateGeo(seedScan: ScanResult): GeoData {
  // Site-wide card displays the seed page's metadata. Footnote with
  // "X of N pages have all 5 fields" is computed at render time, not here.
  return seedScan.axisData?.geo ?? {
    card: {
      domain: "",
      title: null,
      description: null,
      canonicalUrl: null,
      ogTitle: null,
      ogImageUrl: null,
      presentCount: 0,
    },
  };
}

function aggregateContext(scans: ScanResult[]): ContextData {
  // Sum bytes, sum segments per kind then re-percent, take median of
  // contentStartPct.
  let htmlBytes = 0;
  let markdownBytes = 0;
  const segMap = new Map<string, { color: string; bytes: number }>();
  const startPctValues: number[] = [];

  for (const s of scans) {
    const ctx = s.axisData?.context;
    if (!ctx) continue;
    htmlBytes += ctx.htmlBytes;
    markdownBytes += ctx.markdownBytes;
    startPctValues.push(ctx.contentStartPct);
    for (const seg of ctx.budgetSegments) {
      const acc = segMap.get(seg.label) ?? { color: seg.color, bytes: 0 };
      acc.bytes += seg.bytes;
      segMap.set(seg.label, acc);
    }
  }

  const totalSeg = Array.from(segMap.values()).reduce((s, v) => s + v.bytes, 0);
  const aggregatedSegments: ContentBudgetSegment[] = Array.from(segMap.entries())
    .map(([label, v]) => ({
      label,
      color: v.color,
      bytes: v.bytes,
      pct: totalSeg === 0 ? 0 : Math.round((v.bytes / totalSeg) * 1000) / 10,
    }))
    .filter((s) => s.bytes > 0)
    .sort((a, b) => b.bytes - a.bytes);

  const median = (() => {
    if (startPctValues.length === 0) return 0;
    const sorted = [...startPctValues].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
  })();

  const contentSeg = aggregatedSegments.find((s) => s.label === "content");
  const contentSharePct = contentSeg?.pct ?? 0;

  return {
    htmlBytes,
    markdownBytes,
    budgetSegments: aggregatedSegments,
    contentStartPct: median,
    contentSharePct,
  };
}

/** Public aggregator used when building the site-wide CrawlResult. */
export function buildSiteAxisData(args: {
  seedScan: ScanResult;
  allScans: ScanResult[];
}): AxisData {
  return {
    agent: aggregateAgentRetrieval(args.seedScan),
    geo: aggregateGeo(args.seedScan),
    context: aggregateContext(args.allScans),
  };
}
```

- [ ] **Step 6.2: Wire `buildSiteAxisData` into the crawl result builder**

Find the function in `crawl.ts` that constructs the final `CrawlResult` (likely named `buildCrawlResult` or invoked at the end of `crawl()` / `crawlStream()`). Where the `observations` array is being constructed, add the per-axis `axisData` assignment.

If today the code looks something like:

```ts
const observations: SiteObservation[] = [
  buildAgentObservation(seedScan, allScans),
  buildGeoObservation(seedScan, allScans),
  buildContextObservation(seedScan, allScans),
];
```

Change it to:

```ts
const siteAxisData = buildSiteAxisData({ seedScan, allScans });

const observations: SiteObservation[] = [
  { ...buildAgentObservation(seedScan, allScans), axisData: siteAxisData.agent },
  { ...buildGeoObservation(seedScan, allScans), axisData: siteAxisData.geo },
  { ...buildContextObservation(seedScan, allScans), axisData: siteAxisData.context },
];
```

The exact builder names depend on the current code; if observations are built differently (e.g., a single call to `buildObservations(...)`), adapt: assign `axisData` to each returned observation by `axis` field.

If `crawl.ts` does not currently distinguish the seed scan from the rest, add a `seedScan = pages[0].scan` derivation. Defensive: if `pages.length === 0`, skip building observations entirely (existing crawl-error path).

- [ ] **Step 6.3: Verify**

```bash
cd docs-lens-next && npx tsc --noEmit 2>&1 | grep -cE "error TS"
```
Expected: same `AccuracyDisclaimer` error count, no new errors.

```bash
curl -sS --max-time 45 "http://localhost:3000/api/crawl/stream?url=https%3A%2F%2Fdocs.ekline.io&max=2" 2>/dev/null | grep -o '"observations":\[[^]]*\]' | head -1 | head -c 400
```
Expected: a fragment showing `observations` array entries each with an `axisData` field.

- [ ] **Step 6.4: Commit**

```bash
cd /Users/bipinrimal/Downloads/Ekline/ekline-prototypes-org && \
  git add docs-lens-next/src/lib/crawl.ts && \
  git commit -m "$(cat <<'EOF'
feat(docs-lens-next): aggregate per-page axisData into site-wide observations

crawl.ts now builds site-wide axisData per spec rules:
  - Agent Retrieval: seed page's probe results verbatim (llms.txt and
    Content-Signals are site-level; .md and Accept use seed URL)
  - GEO: seed page's MetaCardData; per-page coverage shown only in
    pages-sampled expansions
  - Context: sum htmlBytes/markdownBytes across pages, sum segment
    bytes per kind then re-percent, median contentStartPct

Each SiteObservation now carries the corresponding aggregated payload
on its axisData field.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Build the three demo card components

**Files (all new):**
- Create: `docs-lens-next/src/components/axis/AgentRetrievalCard.tsx`
- Create: `docs-lens-next/src/components/axis/GeoCard.tsx`
- Create: `docs-lens-next/src/components/axis/ContextCard.tsx`

**What it does:** Three pure presentational components, each accepting its typed payload from `axisData`. No data shaping inside. Tailwind classes match the existing `card` / `paper` / `ink` design tokens.

- [ ] **Step 7.1: Create `AgentRetrievalCard.tsx`**

Create the file with this exact content:

```tsx
"use client";
import type { AgentRetrievalData } from "@/lib/types";

export function AgentRetrievalCard({ data }: { data: AgentRetrievalData }) {
  const { probes, passingCount } = data;

  return (
    <div className="font-mono text-[12px] bg-paper-dim/60 border border-rule rounded-xl2 px-3.5 py-2.5 leading-[1.7]">
      {probes.map((p, i) => (
        <div
          key={i}
          className="grid grid-cols-[1fr_56px_1fr_22px] gap-2 items-baseline"
        >
          <span className="text-ink/55 truncate">{p.label}</span>
          <span
            className={`text-right font-semibold ${
              p.pass
                ? "text-emerald-700"
                : p.statusText === "error"
                  ? "text-ink/45"
                  : "text-red-700"
            }`}
          >
            {p.statusText}
          </span>
          <span className="text-ink/60 text-[11.5px] truncate">{p.detail}</span>
          <span
            aria-hidden
            className={`text-right text-[14px] leading-none ${
              p.pass
                ? "text-emerald-500"
                : p.statusText === "error"
                  ? "text-ink/30"
                  : "text-red-500"
            }`}
          >
            {p.pass ? "✓" : p.statusText === "error" ? "·" : "✗"}
          </span>
        </div>
      ))}
      <div className="mt-1.5 pt-1.5 border-t border-rule/80 text-[11px] text-ink/45">
        {passingCount} of 4 retrieval signals working
      </div>
    </div>
  );
}
```

- [ ] **Step 7.2: Create `GeoCard.tsx`**

Create the file with this exact content:

```tsx
"use client";
import { useState } from "react";
import type { GeoData } from "@/lib/types";

const MISSING = (
  <span className="text-red-700/85 italic text-[11.5px]">
    no value present
  </span>
);

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + "…" : s;
}

export function GeoCard({ data }: { data: GeoData }) {
  const c = data.card;
  const [imageBroken, setImageBroken] = useState(false);
  const showImage = c.ogImageUrl && !imageBroken;

  return (
    <div className="space-y-2">
      <div className="border border-ink/15 rounded-xl2 p-3 bg-white max-w-[480px]">
        {c.ogImageUrl ? (
          showImage ? (
            <img
              src={c.ogImageUrl}
              alt=""
              onError={() => setImageBroken(true)}
              className="block w-full h-20 object-cover rounded-md mb-2"
            />
          ) : (
            <div className="h-20 rounded-md mb-2 bg-paper-dim border border-rule grid place-items-center text-[11px] text-ink/55">
              og:image present (couldn&apos;t render)
            </div>
          )
        ) : (
          <div className="h-20 rounded-md mb-2 bg-paper-dim border border-dashed border-ink/25 grid place-items-center text-[11px] text-ink/45 italic">
            no og:image
          </div>
        )}
        <div className="text-[11.5px] text-ink/55 mb-0.5">{c.domain || "—"}</div>
        <div className="text-[14px] font-semibold leading-tight text-ink mb-1">
          {c.title ? truncate(c.title, 100) : MISSING}
        </div>
        <div className="text-[12px] text-ink/65 leading-[1.4] mb-1">
          {c.description ? truncate(c.description, 200) : <span className="text-red-700/85 italic">no meta description</span>}
        </div>
        <div className="text-[11px] text-ink/50 mt-2 space-y-0.5">
          <div>
            canonical:{" "}
            {c.canonicalUrl ? (
              <span className="text-ink/70 break-all">{c.canonicalUrl}</span>
            ) : (
              <span className="text-red-700/85 italic">no canonical</span>
            )}
          </div>
          <div>
            og:title:{" "}
            {c.ogTitle ? (
              <span className="text-ink/70">{truncate(c.ogTitle, 80)}</span>
            ) : (
              <span className="text-red-700/85 italic">no og:title</span>
            )}
          </div>
        </div>
      </div>
      <p className="text-[11px] text-ink/50 leading-relaxed max-w-[480px]">
        ↑ rendered from this page&apos;s actual <code className="mono text-[11px] px-1 py-px rounded bg-paper-dim text-ink/85">&lt;meta&gt;</code> tags. This
        is what ChatGPT, Perplexity, and Google AI Overviews show when they cite you.{" "}
        <strong className="font-semibold text-ink">{c.presentCount}/5</strong> fields present.
      </p>
    </div>
  );
}
```

- [ ] **Step 7.3: Create `ContextCard.tsx`**

Create the file with this exact content:

```tsx
"use client";
import type { ContextData } from "@/lib/types";

function fmtBytes(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)} MB`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)} KB`;
  return `${n} B`;
}

function fmtChars(n: number): string {
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return `${n}`;
}

export function ContextCard({ data }: { data: ContextData }) {
  const startBad = data.contentStartPct > 50;
  const startVeryBad = data.contentStartPct > 80;
  const startColor = startVeryBad
    ? "text-red-700"
    : startBad
      ? "text-amber-700"
      : "text-emerald-700";

  return (
    <div className="space-y-3">
      <div>
        <div className="flex justify-between items-baseline mb-1.5 text-[11.5px] text-ink/60">
          <span>
            <strong className="text-ink">{fmtBytes(data.htmlBytes)}</strong> of HTML
          </span>
          <span className="text-ink/45">→ {fmtChars(data.markdownBytes)} chars markdown</span>
        </div>
        {data.budgetSegments.length === 0 ? (
          <div className="h-[22px] rounded-md bg-paper-dim border border-rule grid place-items-center text-[10.5px] text-ink/45 italic">
            byte composition unavailable
          </div>
        ) : (
          <>
            <div className="flex h-[22px] rounded-md overflow-hidden border border-rule">
              {data.budgetSegments.map((seg, i) => (
                <div
                  key={i}
                  className="flex items-center justify-center text-[10px] font-semibold text-white/95"
                  style={{ width: `${seg.pct}%`, backgroundColor: seg.color, minWidth: 0 }}
                  title={`${seg.label}: ${fmtBytes(seg.bytes)} (${seg.pct}%)`}
                >
                  {seg.pct >= 8 ? `${Math.round(seg.pct)}%` : ""}
                </div>
              ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10.5px] text-ink/55">
              {data.budgetSegments.map((seg, i) => (
                <span key={i} className="inline-flex items-center gap-1.5">
                  <span
                    className="w-2 h-2 rounded-sm"
                    style={{ backgroundColor: seg.color }}
                  />
                  {seg.label}
                </span>
              ))}
            </div>
          </>
        )}
      </div>

      <div>
        <div className="text-[11.5px] text-ink/60 mb-1.5">
          Where your content begins in the markdown
        </div>
        <div
          className="h-[14px] rounded-md border border-rule relative"
          style={{
            background: `linear-gradient(to right, #fef2f2 0% ${data.contentStartPct}%, #f0fdf4 ${data.contentStartPct}% 100%)`,
          }}
        >
          <div
            className="absolute -top-0.5 -bottom-0.5 w-[2px]"
            style={{
              left: `${Math.min(100, data.contentStartPct)}%`,
              backgroundColor: startVeryBad ? "#b91c1c" : startBad ? "#b45309" : "#047857",
            }}
            aria-hidden
          />
        </div>
        <div className="mt-1 text-[11px] text-ink/55">
          First meaningful heading at <strong className={startColor}>{data.contentStartPct}%</strong>
          {data.markdownBytes > 0 ? null : <span className="text-ink/45 italic"> · no content extracted</span>}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 7.4: Verify the new files compile**

```bash
cd docs-lens-next && npx tsc --noEmit 2>&1 | grep -cE "error TS"
```
Expected: same `AccuracyDisclaimer` error count.

- [ ] **Step 7.5: Commit**

```bash
cd /Users/bipinrimal/Downloads/Ekline/ekline-prototypes-org && \
  git add docs-lens-next/src/components/axis/AgentRetrievalCard.tsx docs-lens-next/src/components/axis/GeoCard.tsx docs-lens-next/src/components/axis/ContextCard.tsx && \
  git commit -m "$(cat <<'EOF'
feat(docs-lens-next): add three axis demo card components

Pure presentational components, one per axis:
  - AgentRetrievalCard: 4-row HTTP probe panel rendered from
    AgentRetrievalData; pass/fail/error tones using existing palette
  - GeoCard: meta-card preview with og:image rendering (with onError
    fallback), missing-field markers, and a 5-slot layout
  - ContextCard: stacked byte-composition bar plus content-start
    position strip; tones scale with contentStartPct

No data shaping inside; consumers pass typed AxisData payloads.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Wire the demo cards into `DiagnosticHero`

**Files:**
- Modify: `docs-lens-next/src/components/DiagnosticHero.tsx`

**What it does:** Replaces the per-axis paragraph rendering with the three demo cards. Each axis card is selected by `obs.axis` and rendered with its corresponding `axisData` from the observation. The `AxisExpansion` drill-down stays — clicking the card body still expands to show the underlying check list.

- [ ] **Step 8.1: Replace `DiagnosticHero.tsx`**

Overwrite `docs-lens-next/src/components/DiagnosticHero.tsx` with this exact content:

```tsx
"use client";
import { useState } from "react";
import type { ScanResult, Axis, AgentRetrievalData, GeoData, ContextData } from "@/lib/types";
import { AXIS_LABELS } from "@/lib/types";
import { buildObservations, type AxisObservation } from "@/lib/observations";
import { AxisExpansion } from "./AxisExpansion";
import { AgentRetrievalCard } from "./axis/AgentRetrievalCard";
import { GeoCard } from "./axis/GeoCard";
import { ContextCard } from "./axis/ContextCard";

const TONE_STYLE: Record<AxisObservation["tone"], { accent: string; dot: string; label: string }> = {
  clean:   { accent: "border-l-emerald-500",  dot: "bg-emerald-500",  label: "text-emerald-700" },
  watch:   { accent: "border-l-amber-500",    dot: "bg-amber-500",    label: "text-amber-700" },
  concern: { accent: "border-l-red-500",      dot: "bg-red-500",      label: "text-red-700" },
};

const TONE_LABEL: Record<AxisObservation["tone"], string> = {
  clean: "reading cleanly",
  watch: "worth a look",
  concern: "needs attention",
};

function AxisDemo({ axis, data }: { axis: Axis; data: AxisObservation["axisData"] }) {
  if (!data) return null;
  if (axis === "agent") return <AgentRetrievalCard data={data as AgentRetrievalData} />;
  if (axis === "geo") return <GeoCard data={data as GeoData} />;
  if (axis === "context") return <ContextCard data={data as ContextData} />;
  return null;
}

export function DiagnosticHero({ result }: { result: ScanResult }) {
  const observations = buildObservations(result);
  const [expanded, setExpanded] = useState<Axis | null>(null);

  return (
    <section className="card p-6 md:p-8">
      <header className="mb-6 pb-5 border-b border-rule">
        <div className="flex items-center gap-2 mb-2 text-[11px] uppercase tracking-[0.1em] text-ink/45 font-semibold">
          <span className="w-1.5 h-1.5 rounded-full bg-accent-bright" />
          Diagnostic reading
        </div>
        <h2 className="h-section text-[22px] md:text-[26px] leading-tight">
          What an agent sees on{" "}
          <span className="mono text-accent text-[0.85em]">
            {new URL(result.finalUrl).host}
            {new URL(result.finalUrl).pathname}
          </span>
        </h2>
        <p className="text-[13px] text-ink/55 mt-2">
          Three readings · the actual probes, metadata, and bytes behind each.
        </p>
      </header>
      <div className="space-y-3">
        {observations.map((obs) => {
          const meta = AXIS_LABELS[obs.axis];
          const style = TONE_STYLE[obs.tone];
          const isOpen = expanded === obs.axis;
          return (
            <article
              key={obs.axis}
              className={`border border-rule ${isOpen ? "shadow-card-lift border-accent/25" : "hover:border-ink/15"} rounded-xl2 overflow-hidden transition-all`}
            >
              <div className="px-5 py-4">
                <div className="flex items-baseline justify-between gap-4 mb-3">
                  <div className="flex items-center gap-2.5">
                    <span className={`w-2 h-2 rounded-full ${style.dot}`} />
                    <h3 className="text-[11px] uppercase tracking-[0.1em] font-semibold text-ink/55">
                      {meta.title}
                    </h3>
                  </div>
                  <span className={`text-[11px] font-medium ${style.label}`}>
                    {TONE_LABEL[obs.tone]}
                  </span>
                </div>
                <p className="text-[15px] font-semibold text-ink leading-snug mb-3 tracking-[-0.01em]">
                  {obs.headline}
                </p>
                <AxisDemo axis={obs.axis} data={obs.axisData} />
                {obs.fix && (
                  <p className="text-[12.5px] text-ink/75 leading-relaxed mt-3">
                    <span className="text-[10px] uppercase tracking-[0.08em] font-semibold text-ink/45 mr-2">Fix</span>
                    {obs.fix}
                  </p>
                )}
                <button
                  onClick={() => setExpanded(isOpen ? null : obs.axis)}
                  className="mt-3 text-[11px] text-ink/45 hover:text-accent transition-colors"
                >
                  {isOpen ? "hide checks ↑" : "see the checks behind this →"}
                </button>
              </div>
              {isOpen && (
                <div className="px-5 pb-5 pt-1 bg-paper-dim/40 border-t border-rule">
                  <AxisExpansion observation={obs} result={result} />
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
```

- [ ] **Step 8.2: Update `CrawlView.tsx` site-wide observation rendering to use the same card components**

Find the section in `CrawlView.tsx` that renders the site-wide observations list (currently using `obs.paragraph` via `renderInline`). Replace each observation's render block with a card-and-demo structure analogous to `DiagnosticHero`. Specifically, in the `result.observations.map((obs) => ...)` block in `CrawlResults`, change:

```tsx
<p className="text-[15px] font-semibold text-ink leading-snug mb-1.5 tracking-[-0.01em]">
  {obs.headline}
</p>
<p className="text-[13.5px] text-ink/70 leading-relaxed">
  {renderInline(obs.paragraph)}
</p>
```

to:

```tsx
<p className="text-[15px] font-semibold text-ink leading-snug mb-3 tracking-[-0.01em]">
  {obs.headline}
</p>
{obs.axis === "agent" && obs.axisData && (
  <AgentRetrievalCard data={obs.axisData as AgentRetrievalData} />
)}
{obs.axis === "geo" && obs.axisData && (
  <GeoCard data={obs.axisData as GeoData} />
)}
{obs.axis === "context" && obs.axisData && (
  <ContextCard data={obs.axisData as ContextData} />
)}
{obs.fix && (
  <p className="text-[12.5px] text-ink/75 leading-relaxed mt-3">
    <span className="text-[10px] uppercase tracking-[0.08em] font-semibold text-ink/45 mr-2">Fix</span>
    {obs.fix}
  </p>
)}
```

Add the imports at the top:

```tsx
import { AgentRetrievalCard } from "./axis/AgentRetrievalCard";
import { GeoCard } from "./axis/GeoCard";
import { ContextCard } from "./axis/ContextCard";
import type { AgentRetrievalData, GeoData, ContextData } from "@/lib/types";
```

- [ ] **Step 8.3: Verify**

```bash
cd docs-lens-next && npx tsc --noEmit 2>&1 | head -20
```
Expected: `obs.paragraph` may now be flagged as unused property; that's fine — it's still typed but not rendered. The `AccuracyDisclaimer` error remains. No new errors.

If tsc complains about `obs.fix` not existing on `SiteObservation`, you missed the type update. The `SiteObservation` interface should already include the optional `fix?: string` field per Task 4 (re-check `types.ts`).

If `fix` was missed in Task 4, fix it now: in `types.ts` `SiteObservation`, add `fix?: string;` between `headline` and `tone` (or near `paragraph`).

- [ ] **Step 8.4: Commit**

```bash
cd /Users/bipinrimal/Downloads/Ekline/ekline-prototypes-org && \
  git add docs-lens-next/src/components/DiagnosticHero.tsx docs-lens-next/src/components/CrawlView.tsx docs-lens-next/src/lib/types.ts && \
  git commit -m "$(cat <<'EOF'
feat(docs-lens-next): wire axis demo cards into DiagnosticHero and CrawlView

DiagnosticHero now renders the three demo cards in place of paragraph
observations. Drill-down still works (button-driven AxisExpansion).
CrawlView's site-wide observations also render the same cards.

Headline, optional fix line, and the demo card are arranged so the
artifact is the centerpiece; expansion lists the contributing checks.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Strip paragraphs and metaphors from `observations.ts`

**Files:**
- Modify: `docs-lens-next/src/lib/observations.ts`

**What it does:** Removes all paragraph generation, metaphors, and `formatAgent` helpers. Each axis function now returns `{axis, tone, headline, fix?, axisData, topFindings}`. `axisData` is sourced from `result.axisData` (populated in Task 5). Headlines and fix lines are computed deterministically from check counts and axis data, never per-tool.

- [ ] **Step 9.1: Overwrite `observations.ts` with the new minimal builder**

Overwrite `docs-lens-next/src/lib/observations.ts` with this exact content:

```ts
/**
 * Per-axis observation builder. Outputs tone, headline, optional fix,
 * the axis demo payload, and the top contributing checks for drill-down.
 *
 * No paragraphs, no metaphors, no per-tool predictions.
 */

import type {
  AgentRetrievalData,
  Axis,
  CheckResult,
  ContextData,
  GeoData,
  ScanResult,
} from "./types";

export interface AxisObservation {
  axis: Axis;
  headline: string;
  fix?: string;
  tone: "clean" | "watch" | "concern";
  axisData: AgentRetrievalData | GeoData | ContextData;
  topFindings: CheckResult[];
}

const tone = (checks: CheckResult[]): AxisObservation["tone"] => {
  if (checks.some((c) => c.severity === "fail")) return "concern";
  if (checks.some((c) => c.severity === "warn")) return "watch";
  return "clean";
};

function top(checks: CheckResult[], n = 4): CheckResult[] {
  const sev = { fail: 0, warn: 1, info: 2, pass: 3 } as const;
  return [...checks].sort((a, b) => sev[a.severity] - sev[b.severity]).slice(0, n);
}

function observeAgent(result: ScanResult): AxisObservation {
  const checks = result.checks.filter((c) => c.axis === "agent");
  const data = result.axisData?.agent ?? {
    probes: [],
    passingCount: 0,
  };

  const headline = `${data.passingCount} of 4 retrieval signals working.`;
  const failedLabels = data.probes.filter((p) => !p.pass).map((p) => p.label);
  const fix =
    data.passingCount === 4
      ? undefined
      : `Address: ${failedLabels.slice(0, 2).join(", ")}${failedLabels.length > 2 ? ", and others" : ""}.`;

  return {
    axis: "agent",
    tone:
      data.passingCount === 4
        ? "clean"
        : data.passingCount >= 2
          ? "watch"
          : "concern",
    headline,
    fix,
    axisData: data,
    topFindings: top(checks),
  };
}

function observeGeo(result: ScanResult): AxisObservation {
  const checks = result.checks.filter((c) => c.axis === "geo");
  const data = result.axisData?.geo ?? {
    card: {
      domain: "",
      title: null,
      description: null,
      canonicalUrl: null,
      ogTitle: null,
      ogImageUrl: null,
      presentCount: 0,
    },
  };

  const c = data.card;
  const present = c.presentCount;

  const headline =
    present === 5
      ? "Your card is complete."
      : present >= 3
        ? "Your card has gaps."
        : "Your card is missing core fields.";

  const missing: string[] = [];
  if (!c.title) missing.push("title");
  if (!c.description) missing.push("meta description");
  if (!c.canonicalUrl) missing.push("canonical");
  if (!c.ogTitle) missing.push("og:title");
  if (!c.ogImageUrl) missing.push("og:image");
  const fix =
    missing.length === 0
      ? undefined
      : `Add ${missing.slice(0, 3).join(", ")}${missing.length > 3 ? ", and the rest" : ""}.`;

  return {
    axis: "geo",
    tone:
      present === 5
        ? "clean"
        : present >= 3
          ? "watch"
          : "concern",
    headline,
    fix,
    axisData: data,
    topFindings: top(checks),
  };
}

function observeContext(result: ScanResult): AxisObservation {
  const checks = result.checks.filter((c) => c.axis === "context");
  const data = result.axisData?.context ?? {
    htmlBytes: 0,
    markdownBytes: 0,
    budgetSegments: [],
    contentStartPct: 0,
    contentSharePct: 0,
  };

  const share = data.contentSharePct;
  const start = data.contentStartPct;

  const isClean = share >= 30 && start <= 20;
  const isConcern = share < 10 || start > 80;

  const headline =
    isClean
      ? "Your content reaches the agent quickly."
      : isConcern
        ? `Your content is ${Math.round(share)}% of bytes; the rest is overhead.`
        : `Your content is ${Math.round(share)}% of bytes — typical for static docs.`;

  const fixParts: string[] = [];
  if (share < 20) {
    fixParts.push("ship a `.md` variant of every page to skip the chrome and JS payload");
  }
  if (start > 50) {
    fixParts.push("move your `<h1>` closer to the top of the DOM");
  }
  const fix = fixParts.length === 0 ? undefined : `${fixParts.join("; or ")}.`;

  return {
    axis: "context",
    tone: isClean ? "clean" : isConcern ? "concern" : "watch",
    headline,
    fix,
    axisData: data,
    topFindings: top(checks),
  };
}

export function buildObservations(result: ScanResult): AxisObservation[] {
  return [observeAgent(result), observeGeo(result), observeContext(result)];
}
```

- [ ] **Step 9.2: Verify**

```bash
cd docs-lens-next && npx tsc --noEmit 2>&1 | head -20
```
Expected: still only `AccuracyDisclaimer` error. If `CrawlView.tsx` complains about `obs.paragraph`, the line is now dead — remove the `renderInline(obs.paragraph)` reference (or any leftover `paragraph` usage) from `CrawlView.tsx`.

- [ ] **Step 9.3: Commit**

```bash
cd /Users/bipinrimal/Downloads/Ekline/ekline-prototypes-org && \
  git add docs-lens-next/src/lib/observations.ts && \
  git commit -m "$(cat <<'EOF'
refactor(docs-lens-next): drop paragraph observations, output structured payloads

observations.ts now returns {tone, headline, fix?, axisData, topFindings}
per axis. All metaphor copy ("delivery truck", "suitcase", "packing
peanuts") is removed. Headlines and fix lines are computed
deterministically from passingCount, presentCount, contentSharePct, and
contentStartPct — never references a tool we don't measure.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Add `AccuracyDisclaimer` and prune deprecated types

**Files:**
- Create: `docs-lens-next/src/components/AccuracyDisclaimer.tsx`
- Modify: `docs-lens-next/src/lib/types.ts`
- Modify: `docs-lens-next/src/lib/scan.ts` (drop deprecated fields)
- Modify: `docs-lens-next/src/lib/crawl.ts` (drop `agentProfile`)

**What it does:** Adds the footer disclaimer and removes the now-unused `AgentProfile`, `AGENT_LABELS`, `AGENT_PROFILES`, `DeliveryMode`, and `SUMMARIZED_MAIN_CONTEXT_TOKENS` exports. Drops `agentProfile` and `allAgentScores` from `ScanResult`. Drops `agentProfile` from `CrawlResult`. Promotes `axisData` from optional to required on both interfaces.

- [ ] **Step 10.1: Create `AccuracyDisclaimer.tsx`**

Create `docs-lens-next/src/components/AccuracyDisclaimer.tsx` with this exact content:

```tsx
export function AccuracyDisclaimer() {
  return (
    <footer className="border-t border-rule bg-paper-dim/40 px-6 py-6">
      <div className="max-w-[1200px] mx-auto text-[12px] text-ink/65 leading-relaxed">
        <strong className="text-ink font-semibold">About these measurements.</strong>{" "}
        docs-lens fetches each page once via HTTP (no JavaScript execution), converts
        HTML to markdown via Turndown, and runs 28 deterministic checks. The probes and
        byte composition above describe what an extraction-style fetcher — Claude
        Code&apos;s <code className="mono px-1 py-px rounded bg-paper text-ink/85 text-[11.5px]">WebFetch</code>, Jina Reader, and many MCP servers — would see.
        They do <strong className="text-ink">not</strong> describe what claude.ai&apos;s
        server-side <code className="mono px-1 py-px rounded bg-paper text-ink/85 text-[11.5px]">web_fetch</code>{" "}
        (which uses Readability extraction), headless-browser agents like ChatGPT&apos;s
        URL viewer, vision-capable models, or accessibility-tree readers actually
        receive. Pages built as JavaScript-rendered SPAs can look very different to
        those other readers. No simulation, no LLMs in the scoring path — every number
        above ties to a real HTTP response or a deterministic check on the fetched HTML.
      </div>
    </footer>
  );
}
```

- [ ] **Step 10.2: Remove deprecated exports from `types.ts`**

Open `docs-lens-next/src/lib/types.ts`. Remove the following exports entirely (search and delete the blocks):

- `export type AgentProfile = ...`
- `export type DeliveryMode = ...`
- `export const AGENT_PROFILES: Record<...> = { ... }` (the whole map)
- `export const AGENT_LABELS: Record<...> = { ... }` (the whole map)
- `export const SUMMARIZED_MAIN_CONTEXT_TOKENS = ...`

Keep `tokensFromChars` (still needed by ContextCard's neighbors and observation labels).

- [ ] **Step 10.3: Promote `axisData` to required + drop deprecated fields**

Still in `types.ts`:

In `ScanResult`:
- Remove `agentProfile: AgentProfile;`
- Remove `allAgentScores: ...`
- Change `axisData?: AxisData;` to `axisData: AxisData;` (drop the `?`)

In `SiteObservation`:
- Remove `paragraph: string;`
- Add `fix?: string;` if not already present
- Change `axisData?: ...` to required: `axisData: AgentRetrievalData | GeoData | ContextData;`

In `CrawlResult`:
- Remove `agentProfile: AgentProfile;`

- [ ] **Step 10.4: Drop deprecated fields from `scan.ts`**

Open `docs-lens-next/src/lib/scan.ts`. In the `scan` function:

- Remove the `agentProfile: AgentProfile` parameter (or keep accepted-but-ignored for backward compat — see the function signature today; if the existing API callers still pass it from `crawl.ts`, change `scan()` to ignore the arg).
- Remove the entire `for (const [id, p] of Object.entries(AGENT_PROFILES) ...)` loop that built `allAgentScores`.
- Remove `agentProfile,` and `allAgentScores,` from the returned object.
- Remove the `import { AGENT_PROFILES, type AgentProfile, ... } from "./types"` reference (only keep what's still used).

The `truncatedAt` should now be hardcoded: replace whatever profile-driven cap logic exists with `markdown.length > 100_000 ? 100_000 : null`. The truncation reason simplifies to: `"Truncation boundary at 100,000 characters."`.

- [ ] **Step 10.5: Drop `agentProfile` from `crawl.ts`**

Open `docs-lens-next/src/lib/crawl.ts`. Remove `agentProfile` from the public `crawl` and `crawlStream` function signatures (or accept-and-ignore). Remove `agentProfile` from the `CrawlResult` returned object. Update internal `scan()` calls to no longer pass an agent.

- [ ] **Step 10.6: Drop `agent` query param parsing from crawl API routes**

Open `docs-lens-next/src/app/api/crawl/route.ts` and `docs-lens-next/src/app/api/crawl/stream/route.ts`. Remove the `searchParams.get("agent")` extraction and the `AgentProfile` import. The route handler still ignores the query param if a client sends it (no error), but doesn't pass it down.

- [ ] **Step 10.7: Verify**

```bash
cd docs-lens-next && npx tsc --noEmit
```
Expected: exit 0, no errors. The `AccuracyDisclaimer` is now resolvable; deprecated types have no remaining consumers.

```bash
npm run lint 2>&1 | grep -oE "[a-zA-Z-]+/[a-zA-Z-]+$" | sort | uniq -c | sort -rn
```
Expected: 0 lines (lint clean) — same as Task 0 baseline.

If lint reports new errors, common causes: unused imports left after removing AGENT_PROFILES references; unused parameters that need a leading underscore; HTML entities (`'` should be `&apos;` in JSX text).

- [ ] **Step 10.8: Smoke-test the dev server**

```bash
curl -sS --max-time 15 -o /dev/null -w "HTTP %{http_code} in %{time_total}s\n" "http://localhost:3000/"
```
Expected: HTTP 200.

```bash
tail -30 docs-lens-next/dev.log | grep -vE "^\[watchdog" | head -20
```
Expected: clean compile. Any `Error:` line means runtime breakage — fix before committing.

- [ ] **Step 10.9: Commit**

```bash
cd /Users/bipinrimal/Downloads/Ekline/ekline-prototypes-org && \
  git add docs-lens-next/src/components/AccuracyDisclaimer.tsx docs-lens-next/src/lib/types.ts docs-lens-next/src/lib/scan.ts docs-lens-next/src/lib/crawl.ts docs-lens-next/src/app/api/crawl/route.ts docs-lens-next/src/app/api/crawl/stream/route.ts && \
  git commit -m "$(cat <<'EOF'
feat(docs-lens-next): add accuracy disclaimer + prune deprecated types

AccuracyDisclaimer footer renders the measurement-scope statement on
every page. Removes AgentProfile, DeliveryMode, AGENT_PROFILES,
AGENT_LABELS, and SUMMARIZED_MAIN_CONTEXT_TOKENS from types.ts now
that no consumer references them. Drops agentProfile and
allAgentScores from ScanResult; drops agentProfile from CrawlResult.
Promotes axisData from optional to required on both interfaces.

Crawl API routes drop the agent query param parsing (still accept it
silently for backward-compat; it is no longer plumbed through).

scan() hardcodes the canonical 100,000-char extraction cap.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Visual QA across four URLs

**Files:** none modified.

**What it does:** Exercises the redesigned product end-to-end against four real docs sites, confirming each axis demo card adapts correctly to differently-shaped pages.

- [ ] **Step 11.1: Check dev server still up**

```bash
cd /Users/bipinrimal/Downloads/Ekline/ekline-prototypes-org/docs-lens-next && \
  ls .dev-pid 2>/dev/null && ps -p "$(cat .dev-pid)" >/dev/null 2>&1 && echo "running" || ./scripts/dev-safe.sh
```
Expected: `running` or fresh start output.

- [ ] **Step 11.2: Crawl four URLs in a browser**

Open each in turn:

| URL | What to confirm |
|---|---|
| `http://localhost:3000/` then enter `https://docs.stripe.com/api` (max 4) | 3 site-wide axis cards render. Agent Retrieval shows /llms.txt 200 + /api.md 404 + Accept html + Content-Signals none. GEO meta-card shows missing description, missing canonical, missing og:image. Context shows ≤10% content share, content-start ≥80%. Pages-sampled list expands per-page to identical card components. |
| `https://docs.ekline.io` (max 4) | Different shape. Smaller HTML; content-start at 0%; some metadata likely missing. |
| `https://developers.cloudflare.com/workers/` (max 4) | Likely passes most signals; tones lean clean/watch. |
| `https://docs.ekline.io/reviewer/quickstart/` (max 4) | Different page from the home; confirms .md probe behaves correctly per-page. |

For each: visually confirm tones, dynamic numbers in headlines (`X of 4 retrieval signals`, presentCount, contentSharePct), absence of any "Claude Code shows X tokens to your main context" string, and that the AccuracyDisclaimer footer is present.

- [ ] **Step 11.3: Verify accuracy constraints (no per-tool predictions)**

```bash
cd docs-lens-next && \
  grep -rE "Cursor sees|Cursor shows|ChatGPT will|ChatGPT shows|Gemini sees|Gemini shows|Haiku reads|Haiku shows" src/ 2>/dev/null
```
Expected: no output. Any match indicates a per-tool prediction string slipped into copy — remove before completing.

- [ ] **Step 11.4: Final type-check + lint sweep**

```bash
cd docs-lens-next && npx tsc --noEmit && npm run lint
```
Expected: tsc exit 0; lint exit 0.

- [ ] **Step 11.5: No commit needed (verification-only task)**

If any QA finding required a code fix, commit the fix with a `fix(docs-lens-next):` message scoped to the specific issue.

---

## Self-review checklist (run after writing the plan)

**1. Spec coverage**

| Spec section | Implementing task |
|---|---|
| Delete 10 files | Task 3 |
| Modify 8 files | Tasks 1, 2, 5, 6, 8, 9, 10 |
| 4 new files | Tasks 7, 10 |
| Three axis cards (Agent / GEO / Context) | Task 7 wires components, Task 8 mounts them |
| Crawl-only entry surface | Tasks 1, 2 |
| `axisData` derivation per scan | Task 5 |
| Site-wide aggregation | Task 6 |
| Drop paragraph observations + metaphors | Task 9 |
| Accuracy disclaimer footer | Task 10 |
| Drop `AgentProfile` / `AGENT_LABELS` / `SUMMARIZED_MAIN_CONTEXT_TOKENS` | Task 10 |
| Drop `allAgentScores` and `agentProfile` from `ScanResult` | Task 10 |
| Drill-down expansion preserved | Task 8 (`AxisExpansion` integration) |
| Per-page expansion uses same cards | Task 8 (`PageRow` already calls `DiagnosticHero`) |
| Acceptance criteria 1–8 | Task 11 |

**2. Placeholder scan**: every step contains exact code or exact commands. No `TODO`, no `TBD`, no `add appropriate error handling`. Confirmed.

**3. Type consistency**: `AgentRetrievalData`, `GeoData`, `ContextData`, `MetaCardData`, `ProbeResult`, `AxisData`, `AxisObservation` are referenced consistently across Tasks 4 → 11. `axisData` field name is consistent. `passingCount`, `presentCount`, `contentSharePct`, `contentStartPct` field names match between `types.ts` definitions, `scan.ts` derivations, and component consumers. Confirmed.
