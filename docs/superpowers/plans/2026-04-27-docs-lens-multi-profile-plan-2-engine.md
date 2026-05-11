# Docs Lens Multi-Profile — Plan 2: Site Engine

**Goal:** Turn the six-profile fetcher engine from Plan 1 into a full-site scan engine: crawl from a single URL, run all six profiles per page, compute per-page and site-wide deltas, run a deterministic prose layer, produce a ranked fix list. No UI yet — that's Plan 3.

**Architecture:** Add four new layers under `src/lib/`: `crawl/`, `diff/`, `prose/`, `fix/`. Add a `core/runner.ts` that ties profile registry + BrowserPool + per-page fan-out together. The new `/api/scan` route streams results via SSE. The existing `/api/profile` smoke route stays as a debug aid.

**Tech stack additions:** `fast-xml-parser` (already installed), `markdownlint`, `retext`/`retext-readability`/`retext-simplify`/`retext-passive`/`retext-stringify`, `alex`, `vale-bin` (or document `brew install vale`).

**Spec:** [`2026-04-26-docs-lens-multi-profile-design.md`](../specs/2026-04-26-docs-lens-multi-profile-design.md), sections 4 (architecture), 6 (crawler), 7 (checks + prose + attribution), 9 (streaming).

---

## Sequencing rationale

Carryover bugs from Plan 1 first (deduplicate `BrowserCtx`, generic profile runner). Then crawl, then orchestrator skeleton, then diff, then prose, then fix engine, then SSE wiring. Each layer is testable in isolation before the next layer depends on it.

---

## Task list

### Foundation

- **F1.** Lift `BrowserCtx` to `src/lib/core/browser-ctx.ts`. Re-export from `headless.ts` and `axTree.ts` for back-compat. Update tests to import from the new location.

- **F2.** Add `src/lib/core/registry.ts` — a profile registry that adapts both single-arg and two-arg profile fetch shapes behind a uniform `runProfile(id, ctx, deps)` call. Replace the giant switch in `/api/profile/route.ts` with a registry lookup.

### Crawl

- **C1.** `src/lib/crawl/sitemap.ts` — fetch and parse `sitemap.xml` (and sitemap-index files). Returns `string[]` of discovered URLs. Tests with two captured fixtures: a flat sitemap and a sitemap-index.

- **C2.** `src/lib/crawl/bfs.ts` — given a seed URL + same-host + path-prefix scope, do BFS by following `<a href>` in HTML up to a depth or count cap. Returns `string[]`. Tests with a tiny captured site (3 fixture pages cross-linked).

- **C3.** `src/lib/crawl/discover.ts` — try sitemap, fall back to BFS, scope to URL's path prefix, dedupe and normalize. 250-page soft cap. Returns `{ pages: string[], source: "sitemap" | "bfs", capped: boolean }`. Tests: sitemap path, BFS-fallback path, cap behavior.

### Runner

- **R1.** `src/lib/core/runner.ts` — `Runner` class encapsulating BrowserPool lifecycle + concurrent per-page work. Method `scanPage(url)` runs all six profiles for one page in parallel via the registry, returns `Record<ProfileId, ProfileResult>`. Tests with mocked profiles.

- **R2.** `src/lib/core/run-types.ts` — types for a Run: `RunConfig`, `RunStatus`, `PageResult`, `RunResult`, `RunEvent` (the union of SSE events).

- **R3.** Extend `Runner` with `scanSite(seed, onEvent)` — calls `discover`, then fans out `scanPage` across pages with bounded concurrency (default 4), emits `RunEvent`s as work completes.

### Diff & site stats

- **D1.** `src/lib/diff/profile-diff.ts` — given `Record<ProfileId, ProfileResult>` for one page, compute per-profile token/char fractions vs the largest profile, plus a "JS-gated %" metric (`(headless - rawHttp) / max(1, headless)` clamped 0-1). Tests.

- **D2.** `src/lib/diff/site-stats.ts` — given an array of `PageResult`, compute site-level rollups: pages scanned, average JS-gated %, average Readability survival, average tokens per profile, fix backlog count. Tests.

### Prose layer

- **P1.** `src/lib/prose/markdownlint.ts` — wrap markdownlint, return `FixFinding[]`. Tests with input markdown that violates two known rules.

- **P2.** `src/lib/prose/retext.ts` — pipeline `retext-readability` + `retext-simplify` + `retext-passive`. Tests with prose containing each issue.

- **P3.** `src/lib/prose/alex.ts` — alex integration. Tests with input containing inclusive-language flags.

- **P4.** `src/lib/prose/vale.ts` — shell out to `vale` binary. Detect installation; if missing, return one finding "vale not installed" instead of throwing. Tests with mocked spawn.

- **P5.** `src/lib/prose/runner.ts` — `runProse(markdown, pageUrl)` runs all four tools, returns merged `FixFinding[]`. Tests.

### Fix engine

- **X1.** `src/lib/fix/types.ts` — `FixFinding` type with `affectedProfiles: ProfileId[] | "general"`, severity, source, occurrences, evidence, fixHint.

- **X2.** `src/lib/fix/attribution.ts` — hand-curated map from finding-id (from Vale rule, retext message, markdownlint code, internal check id) to affected profiles. The 6-8 defensible cases from the spec section 7.3. Everything else returns `"general"`. Tests.

- **X3.** `src/lib/fix/engine.ts` — given findings from all pages, dedupe across pages (same id+title → bump `occurrences`), apply attribution, rank by (severity, occurrences, profile-count, source). Returns `FixFinding[]`. Tests.

### Orchestrator + API

- **O1.** Wire prose + fix engine into `Runner.scanSite` so `RunResult` carries the final ranked fix list.

- **O2.** `src/app/api/scan/route.ts` — `POST /api/scan { url }` returns `{ runId }` and kicks off the run in the background. Persistence: in-memory map for now (one process, dev mode).

- **O3.** `src/app/api/scan/[id]/stream/route.ts` — SSE endpoint that streams `RunEvent`s. If the run is already done, replays the final state and closes.

- **O4.** `src/app/api/scan/[id]/route.ts` — `GET` returns the full `RunResult` JSON (snapshot at request time).

### Finishing

- **F3.** Coverage check on `src/lib/{crawl,diff,prose,fix}/`. Tag `plan2-engine-complete`. One-paragraph milestone summary.

---

## Out of scope (Plan 3)

- New three-section UI (homepage strip, page matrix, fix list).
- Per-page and per-profile drilldowns.
- `AccuracyDisclaimer` rewrite.
- History sidebar wired to new run shape.

---

## Notes for the executor

- All tasks follow TDD (write failing test, implement, pass, commit).
- Commit one task at a time; commit messages prefixed `feat(crawl)`, `feat(diff)`, `feat(prose)`, `feat(fix)`, `feat(api)`, or `refactor(core)`.
- After each commit, run `npm test && npm run lint && npx tsc --noEmit` (the existing pre-existing GeoCard.tsx warning is fine).
- `npm run test:browser` should still pass at every checkpoint.
- Vale binary may not be installed locally. The prose layer must degrade gracefully: report "vale not installed" once instead of failing every scan.
