# Session pause — 2026-04-27

**Branch:** `prototype/docs-lens-multi-profile` (off `prototype/docs-lens-webfetch-fidelity`)

**Tags:** `plan1-profiles-complete`, `plan2-engine-complete`

## Status

Plans 1 and 2 of the docs-lens multi-profile rebuild are shipped, tagged, and tested. The engine works end-to-end: paste a URL, get a full-site multi-profile scan with per-page deltas, site-wide rollups, and a ranked fix list.

- 63 unit/integration tests + 6 browser tests, all green
- Lint + `tsc --noEmit` clean (1 pre-existing GeoCard `<img>` warning)
- Smoke test against `https://example.com` produced a real `RunResult` JSON

## Outstanding work — Plan 3 (UI rebuild)

Spec sections 8.1–8.7 cover what to build. Scope:

1. **Homepage rebuild** — three sections, top to bottom:
   - **Headline delta strip** (5 tiles): Site coverage, JS-gated %, Readability survival, token budget, fix backlog
   - **Page matrix**: one row per page, six profile columns, click → page drilldown
   - **Ranked fix list**: top 20 + "show all", profile chips, evidence on click
2. **`/scan/[id]/page/[pageIndex]`** — six profile columns side by side, diff highlighting, collapse to vertical accordion under 800px
3. **`/scan/[id]/profile/[profileId]`** — site-wide view through one reader (e.g. "show me the Stripe docs as Claude Code WebFetch sees them")
4. **`AccuracyDisclaimer`** — rewrite to reflect the new methodology (six profiles + Jina ground-truth anchor)
5. **History sidebar** — wire `useHistory` to new `run` shape from the new API
6. Existing `DiagnosticHero`, `AgentPanel`, `HumanPanel`, `ScoreBar`, `TrendSparkline`, axis cards survive — repurposed inside the new shell, not thrown away

## Engine surface area Plan 3 consumes

- `POST /api/scan { url, cap?, pageConcurrency?, browserMaxContexts? }` → `{ id }`
- `GET /api/scan/[id]/stream` (SSE) — replays past events + streams live; terminal event is `run:done` or `run:error`
- `GET /api/scan/[id]` — snapshot of `{ id, status, result, errorMessage }`
- All types in `src/lib/core/run-types.ts`: `RunEvent` union, `RunResult`, `PageResult`, `PageDiff`, `SiteStats`, `FixFinding`

## Resume checklist

```bash
cd /Users/bipinrimal/Downloads/Ekline/ekline-prototypes-org/docs-lens-next
git checkout prototype/docs-lens-multi-profile
git pull --ff-only       # if there were any new commits
npm install              # in case deps changed
npm test && npm run test:browser
# everything green? proceed to Plan 3.
```

Then either:

- **Subagent-driven Plan 3** — same flow as Plan 1 (slow, careful, isolation per task)
- **Inline execution Plan 3** — same flow as Plan 2 (faster, in-session, my context)
- **Brainstorm scope first** — if the homepage layout has open questions, run through `brainstorming` again before writing the Plan 3 spec sections to a plan file

## Known gotchas to remember

- `@anthropic-ai/tokenizer` was dropped because of WASM under Turbopack; Claude tokens use `chars / 4` (label `≈` in UI). GPT tokens are precise via `js-tiktoken`. (`src/lib/tokenizer/count.ts`)
- Playwright `page.accessibility.snapshot()` was removed in 1.50; we use `page.ariaSnapshot()` which returns flattened YAML directly.
- Browser tests run via `vitest.browser.config.ts`; the default suite excludes them.
- `headlessProfile` and `axTreeProfile` need a second arg (`BrowserCtx`); UI code should never invoke profile fetchers directly — go through `runProfile()` or `Runner`.
- Vale degrades gracefully (returns one info-severity finding) when the binary is missing. `.vale.ini` ships with the repo and points at `.vale-styles/` for built-in `Vale` checks.

## Last commit hashes

```
d4e3de0 feat(api): /api/scan + SSE stream + run snapshot, plus tokenizer swap (js-tiktoken)
49dedf9 feat(fix): per-profile attribution map + dedupe/rank engine
aa6f23a feat(prose): markdownlint + retext + alex + vale wrappers + runner
3fc6d01 feat(diff): extract per-page diff + add site-stats rollups
13af277 feat(core): Runner.scanSite with bounded concurrency + event emission
52c550e feat(core): Runner.scanPage + Run/Page/SiteStats/RunEvent types
89fbf9a feat(crawl): hybrid discover (sitemap → BFS fallback) with 250-page soft cap
52ffbe1 feat(crawl): subpath-scoped BFS with depth + page caps
5cbc750 feat(crawl): sitemap parser + index recursion
c9bf475 feat(core): profile registry abstracts single-arg vs two-arg fetchers
e6a4484 refactor(core): lift BrowserCtx to shared module + ignore coverage in eslint
03d8fcb docs: add Plan 2 (Site Engine) implementation plan
```

(`plan1-profiles-complete` is at `ebb9bf4`, `plan2-engine-complete` is at `d4e3de0`.)
