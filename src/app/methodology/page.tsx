import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { allFixCopyEntries, type FixCopy } from "@/lib/fix/check-fix-copy";
import { axisOf, type Axis } from "@/lib/types";

interface Consumer {
  name: string;
  detail: string;
  cite?: { label: string; url: string };
}

interface ProfileSection {
  id: string;
  eyebrow: string;
  title: string;
  whatItIs: string;
  consumers: Consumer[];
  status: "good" | "partial" | "broken"; // tone for the visual indicator only
}

const PROFILES: ProfileSection[] = [
  {
    id: "rawHttp",
    eyebrow: "PROFILE 01 / 03",
    title: "Raw HTTP fetcher",
    whatItIs:
      "A bare GET with no JavaScript execution. The HTML is run through Turndown to produce markdown, and <style> / <script> tags are stripped before extraction.",
    status: "good",
    consumers: [
      {
        name: "Claude Code WebFetch",
        detail:
          "v2.1.105 stripped <style>/<script> contents. 100 KB markdown char cap before a Haiku summarisation sub-call.",
        cite: {
          label: "Claude Code CHANGELOG",
          url: "https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md",
        },
      },
      {
        name: "Anthropic API web_fetch",
        detail: "Server-side raw HTTP, returns the document body as a block.",
        cite: {
          label: "platform.claude.com docs",
          url: "https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-fetch-tool",
        },
      },
      {
        name: "Continue.dev",
        detail: "HttpContextProvider.ts uses plain HTTP plus markdown conversion. No JS.",
        cite: {
          label: "continuedev/continue source",
          url: "https://github.com/continuedev/continue/blob/main/core/context/providers/HttpContextProvider.ts",
        },
      },
      {
        name: "Aider (httpx fallback)",
        detail: "Falls back to httpx when Playwright is not installed.",
        cite: {
          label: "aider/scrape.py",
          url: "https://github.com/paul-gauthier/aider/blob/main/aider/scrape.py",
        },
      },
    ],
  },
  {
    id: "headless",
    eyebrow: "PROFILE 02 / 03",
    title: "Headless browser",
    whatItIs:
      "Full Chromium, full JavaScript and CSS execution. Reads the post-render DOM. Local dev runs Playwright; hosted deployments proxy through Jina Reader (Puppeteer + Chrome under the hood).",
    status: "partial",
    consumers: [
      {
        name: "ChatGPT Atlas",
        detail: "Full Chromium via OpenAI's OWL layer. Reads from the rendered DOM.",
        cite: {
          label: "OpenAI: Building ChatGPT Atlas",
          url: "https://openai.com/index/building-chatgpt-atlas/",
        },
      },
      {
        name: "Perplexity Comet",
        detail: "Chromium-based browser, full JS rendering.",
        cite: {
          label: "Comet engine",
          url: "https://comet-help.perplexity.ai/en/articles/11583798-what-is-comet-s-browser-engine",
        },
      },
      {
        name: "Cline + Roo Code",
        detail:
          "Puppeteer-based browser tool, captures DOM and screenshots. Roo also supports Playwright-MCP.",
        cite: { label: "cline/cline", url: "https://github.com/cline/cline" },
      },
      {
        name: "Aider (with Playwright)",
        detail: "Switches to Chromium when aider install-playwright has been run.",
      },
      {
        name: "Bingbot / Googlebot WRS",
        detail:
          "Index-side renderer used by Bing Chat, Microsoft Copilot, GitHub Copilot Chat web grounding, Gemini URL context. Same render pipeline — but the agent reads what was indexed last week, not what is on your page right now.",
        cite: {
          label: "Vercel — The rise of the AI crawler",
          url: "https://vercel.com/blog/the-rise-of-the-ai-crawler",
        },
      },
    ],
  },
  {
    id: "snippet",
    eyebrow: "PROFILE 03 / 03",
    title: "Search snippet",
    whatItIs:
      "Never fetches the full page. Receives a ranked snippet — title, meta description, OG tags, first H1, the first ~200 characters of visible text, and any JSON-LD.",
    status: "broken",
    consumers: [
      {
        name: "ChatGPT Search",
        detail: "Bing-grounded snippets. The agent reads ranked results, not full pages.",
      },
      {
        name: "Anthropic API web_search",
        detail: "Brave-backed snippets. Full bodies require a separate web_fetch call.",
        cite: {
          label: "Anthropic web_search docs",
          url: "https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool",
        },
      },
      {
        name: "Perplexity (declared bot)",
        detail: "Snippet-first; full body fetched separately when needed.",
        cite: {
          label: "Perplexity crawlers",
          url: "https://docs.perplexity.ai/docs/resources/perplexity-crawlers",
        },
      },
      {
        name: "Cursor @web / @docs",
        detail: "Chunked-and-embedded crawl. Returns embedding chunks rather than pages.",
      },
      {
        name: "Phind, You.com, GitHub Copilot Chat",
        detail: "Web grounding via Bing or comparable snippet APIs.",
      },
    ],
  },
];

const STATUS_TONE = {
  good: "var(--color-pass-ring)",
  partial: "var(--color-warn-ring)",
  broken: "var(--color-fail-ring)",
} as const;

const CHECK_CATEGORIES: Array<{
  title: string;
  examples: string;
}> = [
  {
    title: "Discoverability",
    examples: "/llms.txt manifest, sitemap, /.well-known/ endpoints, link-header api-catalog",
  },
  {
    title: "Content accessibility",
    examples: "auth gates, redirect behaviour, HTTP status codes, soft 404s",
  },
  {
    title: "Page size & truncation",
    examples: "HTML byte cap, markdown byte cap, content start position",
  },
  {
    title: "Content structure",
    examples: "heading hierarchy, code-fence validity, JSON validity, internal-link integrity",
  },
  {
    title: "Rendering & extraction",
    examples: "client-side rendering, tabbed content serialization, image alt text",
  },
  {
    title: "Metadata completeness",
    examples: "title, meta description, OG tags, JSON-LD, robots policy",
  },
];

export default function MethodologyPage() {
  return (
    <div className="min-h-screen flex flex-col bg-paper">
      {/* Top nav matches homepage + scan page */}
      <SiteHeader />

      <main className="flex-1 flex flex-col">
        {/* Hero */}
        <section className="relative px-6 pt-14 pb-12 overflow-hidden">
          <div className="absolute inset-0 -z-10 bg-gradient-to-br from-paper-tint/40 via-paper to-paper" />
          <div className="max-w-[1100px] mx-auto">
            <div className="inline-flex items-center gap-2 mb-5 chip">
              <span className="w-1.5 h-1.5 rounded-full bg-accent" />
              <span className="mono text-[10.5px] uppercase tracking-[0.12em]">
                methodology · the substance, not the score
              </span>
            </div>
            <h1 className="h-display h-navy text-[40px] md:text-[60px] leading-[1.02] mb-5 max-w-3xl">
              How Docs Lens reads <span className="accent-underline">your docs.</span>
            </h1>
            <p className="text-[16px] md:text-[17px] text-ink/70 max-w-2xl leading-relaxed">
              Three reader profiles, each grounded in named real products. Deterministic
              checks only. No LLMs in the scoring path. Every claim ties to a real HTTP
              response, a release note, or a tool&apos;s output a skeptic can re-run.
            </p>
          </div>
        </section>

        {/* Profile cards */}
        <section className="px-6 pb-12">
          <div className="max-w-[1100px] mx-auto">
            <div className="flex items-baseline gap-3 mb-6">
              <h2 className="h-display text-[26px] h-navy">The three reader profiles</h2>
              <span className="text-[11.5px] text-ink/55">
                Pick a docs URL, we run all three in parallel.
              </span>
            </div>
            <div className="space-y-6">
              {PROFILES.map((p) => (
                <article
                  key={p.id}
                  className="card p-6 md:p-8 hover:shadow-card-lift transition-shadow"
                >
                  <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-6">
                    <aside className="space-y-3">
                      <div className="text-[10.5px] uppercase tracking-[0.12em] text-ink/45 mono">
                        {p.eyebrow}
                      </div>
                      <h3 className="text-[19px] font-bold h-navy leading-tight">{p.title}</h3>
                      <span
                        className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-[0.08em]"
                        style={{
                          backgroundColor: STATUS_TONE[p.status],
                          color: "white",
                          opacity: 0.85,
                        }}
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-white/90" />
                        {p.status === "good"
                          ? "Strict reader"
                          : p.status === "partial"
                            ? "Permissive reader"
                            : "Metadata only"}
                      </span>
                    </aside>
                    <div>
                      <p className="text-[14px] text-ink/80 leading-relaxed mb-5">{p.whatItIs}</p>
                      <div className="text-[10.5px] uppercase tracking-[0.12em] text-ink/45 mono mb-3">
                        Real consumers
                      </div>
                      <ul className="space-y-3">
                        {p.consumers.map((c) => (
                          <li
                            key={c.name}
                            className="border-l-2 border-rule pl-4 hover:border-accent transition-colors"
                          >
                            <div className="font-semibold text-[13.5px] text-ink mb-0.5">
                              {c.name}
                            </div>
                            <p className="text-[12.5px] text-ink/70 leading-relaxed">{c.detail}</p>
                            {c.cite && (
                              <a
                                href={c.cite.url}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-block mt-1 text-[11px] text-ink/50 italic hover:text-accent transition-colors"
                              >
                                ↗ {c.cite.label}
                              </a>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* What we check */}
        <section className="px-6 py-12 border-t border-rule bg-paper-dim/30">
          <div className="max-w-[1100px] mx-auto">
            <div className="flex items-baseline gap-3 mb-2">
              <span className="text-[10.5px] uppercase tracking-[0.12em] text-ink/45 mono">
                SECTION 02
              </span>
            </div>
            <h2 className="h-display text-[26px] h-navy mb-3">What we check</h2>
            <p className="text-[14px] text-ink/70 max-w-3xl mb-6 leading-relaxed">
              Deterministic checks only. No LLMs in the scoring path. Every check is implemented
              in <code className="mono px-1.5 py-px rounded bg-paper text-ink/85 text-[12px]">src/lib/checks/</code>{" "}
              and re-runnable by hand against your URL.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {CHECK_CATEGORIES.map((cat) => (
                <div key={cat.title} className="card p-4">
                  <div className="font-semibold text-[14px] text-ink mb-1">{cat.title}</div>
                  <p className="text-[12.5px] text-ink/65 leading-relaxed">{cat.examples}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* What we don't measure */}
        <section className="px-6 py-12 border-t border-rule">
          <div className="max-w-[1100px] mx-auto grid grid-cols-1 md:grid-cols-2 gap-8">
            <div>
              <span className="text-[10.5px] uppercase tracking-[0.12em] text-ink/45 mono mb-2 inline-block">
                SECTION 03
              </span>
              <h2 className="h-display text-[26px] h-navy mb-3">What we don&apos;t measure</h2>
              <p className="text-[14px] text-ink/70 leading-relaxed">
                We don&apos;t lint your prose. Whether your sentences are too long or your tone is
                too passive doesn&apos;t change whether an agent can read the page. Tools like{" "}
                <a href="https://vale.sh" className="text-accent hover:underline">
                  Vale
                </a>{" "}
                and{" "}
                <a href="https://alexjs.com" className="text-accent hover:underline">
                  alex
                </a>{" "}
                exist for that. We also don&apos;t run lighthouse audits, accessibility audits
                beyond what is directly relevant to agent extraction, or SEO checks beyond the
                metadata that snippet readers consume.
              </p>
            </div>
            <div>
              <span className="text-[10.5px] uppercase tracking-[0.12em] text-ink/45 mono mb-2 inline-block">
                SECTION 04
              </span>
              <h2 className="h-display text-[26px] h-navy mb-3">The grade</h2>
              <p className="text-[14px] text-ink/70 leading-relaxed">
                Every scan can produce a 0-100 score and a letter grade. We deliberately demote it
                to a footer-level affordance — it exists for shareability, not for headline. The
                headline of your scan is the one-sentence verdict, not a number. The number is in
                the agent-fix prompt because the prompt has to be self-contained when pasted
                elsewhere.
              </p>
            </div>
          </div>
        </section>

        {/* Per-check rubric — one section per check, with anchored ids so scan
            results can deep-link here from each FAIL/WARN row. */}
        <CheckRubric />

        {/* Open source / CTA */}
        <section className="px-6 py-14 border-t border-rule bg-gradient-to-br from-paper to-paper-tint/40">
          <div className="max-w-[1100px] mx-auto text-center">
            <span className="text-[10.5px] uppercase tracking-[0.12em] text-ink/45 mono mb-3 inline-block">
              SECTION 06 · OPEN SOURCE
            </span>
            <h2 className="h-display text-[28px] md:text-[34px] h-navy mb-4 max-w-2xl mx-auto leading-tight">
              The whole scoring path is open. Re-run any number we show you.
            </h2>
            <div className="inline-flex items-center gap-2 px-4 py-3 rounded-lg bg-[color:var(--color-agent-bg)] text-[color:var(--color-agent-fg)] mono text-[12.5px] mb-6">
              <span className="text-[color:var(--color-agent-muted)]">$</span>
              <span>npx afdocs check &lt;url&gt; --fixes --verbose</span>
            </div>
            <div>
              <Link href="/" className="btn-accent">
                Paste a URL →
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-rule py-8 px-6">
        <div className="max-w-[1100px] mx-auto flex items-center justify-between gap-4 flex-wrap text-[12px] text-ink/55">
          <div className="flex items-center gap-2">
            <span className="inline-block w-1.5 h-1.5 rounded-sm bg-accent" />
            <span>Docs Lens · Educational tool by EkLine</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/" className="hover:text-accent transition-colors">
              Home
            </Link>
            <a
              href="https://ekline.io"
              target="_blank"
              rel="noreferrer"
              className="hover:text-accent transition-colors"
            >
              EkLine.io
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Per-check rubric. One section per check, with anchored ids so the scan   */
/* results page can deep-link from each FAIL/WARN row. The data is pulled  */
/* from `src/lib/fix/check-fix-copy.ts` — same source the agent-fix prompt */
/* and the in-row "Why it matters / How to fix" panels read from. Adding a  */
/* new check there propagates here automatically.                          */
/* ------------------------------------------------------------------------ */

const AXIS_META: Record<
  Axis,
  { title: string; subtitle: string; toneBadge: string }
> = {
  agent: {
    title: "Agent retrieval",
    subtitle:
      "Whether coding agents (Claude Code, Cursor, Continue) can read this site.",
    toneBadge: "bg-emerald-50 text-emerald-800 border-emerald-200",
  },
  geo: {
    title: "Generative engine",
    subtitle:
      "Whether answer engines (ChatGPT Search, Perplexity, You.com) surface this site.",
    toneBadge: "bg-sky-50 text-sky-800 border-sky-200",
  },
  context: {
    title: "Context management",
    subtitle:
      "Whether this site fits efficiently into an agent's context window per page.",
    toneBadge: "bg-amber-50 text-amber-800 border-amber-200",
  },
};

const AXIS_ORDER: Axis[] = ["agent", "geo", "context"];

function CheckRubric() {
  const groups: Record<Axis, Array<{ id: string; copy: FixCopy }>> = {
    agent: [],
    geo: [],
    context: [],
  };
  for (const entry of allFixCopyEntries()) {
    groups[axisOf(entry.id)].push(entry);
  }
  for (const axis of AXIS_ORDER) {
    groups[axis].sort((a, b) => a.copy.title.localeCompare(b.copy.title));
  }
  return (
    <section className="px-6 py-14 border-t border-rule">
      <div className="max-w-[1100px] mx-auto">
        <div className="flex items-baseline gap-3 mb-2">
          <span className="text-[10.5px] uppercase tracking-[0.12em] text-ink/45 mono">
            SECTION 05
          </span>
        </div>
        <h2 className="h-display text-[26px] h-navy mb-2">
          Every check, in detail
        </h2>
        <p className="text-[14px] text-ink/70 max-w-3xl mb-8 leading-relaxed">
          One entry per check. Each scan-result FAIL/WARN row links here so
          you can ground the verdict in its rubric definition. Anchor URLs
          are stable — bookmark, share, or link from your own docs review.
        </p>

        <div className="space-y-12">
          {AXIS_ORDER.map((axis) => {
            const meta = AXIS_META[axis];
            const items = groups[axis];
            if (items.length === 0) return null;
            return (
              <div key={axis}>
                <div className="mb-4 flex items-baseline gap-3 flex-wrap">
                  <h3 className="text-[18px] font-bold text-ink h-navy">
                    {meta.title}
                  </h3>
                  <span
                    className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10.5px] mono font-semibold ${meta.toneBadge}`}
                  >
                    {items.length} {items.length === 1 ? "check" : "checks"}
                  </span>
                </div>
                <p className="text-[13px] text-ink/65 mb-5 max-w-2xl leading-relaxed">
                  {meta.subtitle}
                </p>
                <div className="grid grid-cols-1 gap-3">
                  {items.map(({ id, copy }) => (
                    <article
                      key={id}
                      id={id}
                      className="rounded-lg border border-rule bg-white p-4 scroll-mt-24 target:bg-paper-tint/40 target:border-accent target:ring-1 target:ring-accent/40 transition-colors"
                    >
                      <div className="flex items-baseline justify-between gap-3 mb-1.5 flex-wrap">
                        <h4 className="text-[15px] font-semibold text-ink leading-tight">
                          {copy.title}
                        </h4>
                        <a
                          href={`#${id}`}
                          className="mono text-[10.5px] text-ink/40 hover:text-accent transition-colors"
                          aria-label={`Anchor link for ${id}`}
                        >
                          #{id}
                        </a>
                      </div>
                      <p className="text-[12.5px] text-ink/70 leading-relaxed mb-3">
                        {copy.long}
                      </p>
                      <div className="rounded-md border border-rule bg-paper-dim/50 p-3">
                        <div className="text-[10px] uppercase tracking-[0.12em] text-ink/45 mono mb-1">
                          Typical fix
                        </div>
                        <p className="text-[12.5px] text-ink/85 leading-relaxed">
                          {copy.short}
                        </p>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
