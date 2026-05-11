# Docs Lens

Free educational tool that shows how three populations of agent products read your documentation, why their reads diverge, and gives you a copyable agent-fix prompt.

> "See what every agent reader gets when it visits your docs."

Built by [EkLine](https://ekline.io). Inspired by [buildwithfern's agent-score](https://buildwithfern.com/agent-score) and Cloudflare's [isitagentready.com](https://isitagentready.com), but with a different angle: the **visual hook** — side-by-side rendered page vs three agent reads — and **substance over score**.

## What it does

For any docs URL, Docs Lens fetches every discovered page through three independent reader profiles:

| Profile | What it is | Real consumers |
|---|---|---|
| **Raw HTTP** | undici + Turndown, no JavaScript, strips `<style>` and `<script>` | Claude Code WebFetch, Anthropic API `web_fetch`, Continue.dev, Aider (default) |
| **Headless browser** | Full Chromium with JS execution (Playwright local / Jina Reader hosted) | ChatGPT Atlas, Perplexity Comet, Cline, Roo Code, modern Bingbot/Googlebot WRS |
| **Search snippet** | Title + meta description + OG tags + first H1 + ~200 char preview | ChatGPT Search, Anthropic API `web_search`, Perplexity declared bot, Cursor `@web`, You.com, Phind |

It then runs **38 deterministic checks** across discoverability, content accessibility, page size, content structure, capability discovery (MCP, OAuth, Agent Skills, A2A), URL stability, and metadata completeness — all with traceable HTTP audit transcripts. Findings are rolled into a single copyable agent-fix prompt you can paste into Claude Code, Cursor, or any coding agent.

No LLMs in the scoring path. Every number ties to a real HTTP response or a Playwright snapshot a skeptic can re-run.

## Running locally

```bash
npm install
npm run playwright:install   # one-time, installs Chromium for the headless profile
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), paste a docs URL, hit Scan.

## Tests, typecheck, build

```bash
npm test                # vitest
npx tsc --noEmit       # typecheck
npm run build           # next build (Turbopack)
```

The `tests/` directory is ESM-friendly Vitest. 61 tests across 18 files.

## Architecture

```
src/lib/
  core/         Profile registry, runner, browser pool, run-store.
  crawl/        Sitemap discovery + BFS crawler.
  profiles/     rawHttp.ts, headless.ts, snippet.ts — the three readers.
  checks/       Site-level + per-page deterministic checks. ~12 files.
  fix/          Fix engine, attribution map, agent-fix prompt generator.
  diff/         Per-page diff metrics + site-stats aggregator.

src/app/
  page.tsx                          Homepage (URL form + 2-col tabbed demo).
  why/page.tsx                      "Why this exists" page.
  methodology/page.tsx              How we measure.
  scan/[id]/page.tsx                Scan summary (results dashboard).
  scan/[id]/page/[pageIndex]/...    Per-page drilldown.
  api/scan/...                      Scan endpoints (POST + SSE stream).
```

## Routes

- `/` — paste a URL, kick off a scan.
- `/scan/[id]` — live scan progress + final results dashboard.
- `/scan/[id]/page/[pageIndex]` — per-page drilldown (rendered + 3 agent views + per-page checks).
- `/methodology` — what we check, what we don't, the grade philosophy.
- `/why` — the case for the tool.
- `/api/scan` — POST a `{url, cap?}` body, get a runId.
- `/api/scan/[id]` — snapshot endpoint (final state).
- `/api/scan/[id]/stream` — SSE stream of per-event progress.

## Limits

- **Page cap**: 10 default, 50 max. Small samples by design.
- **Headless backend**: requires Playwright Chromium installed locally. The headless profile is skipped on hosts without a Chromium binary (e.g. Vercel's Node runtime).
- **Iframe fallback**: most docs sites set `X-Frame-Options: DENY`, blocking the live iframe in the visual hook. We fall back to a Playwright screenshot when one is available, otherwise the iframe is the only fallback.

## Contributing

Contributions welcome. Open an issue or PR against `main`. See `docs/superpowers/specs/` for the v2 design doc and `docs/superpowers/plans/` for the implementation plan.

## License

[MIT](./LICENSE) &copy; EkLine

