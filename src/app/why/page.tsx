import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";

interface Citation {
  text: string;
  href: string;
}

interface ShiftItem {
  eyebrow: string;
  title: string;
  body: string;
  cite?: Citation;
}

const SHIFTS: ShiftItem[] = [
  {
    eyebrow: "OCT 2025",
    title: "Claude Code WebFetch tightens",
    body: "Anthropic shipped v2.1.105 of Claude Code. The release note: \"Improved WebFetch to strip <style> and <script> contents from fetched pages so CSS-heavy pages no longer exhaust the content budget before reaching actual text.\" Agents now ignore your CSS. Pages designed around styling lose the content-design contract.",
    cite: {
      text: "anthropics/claude-code CHANGELOG",
      href: "https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md",
    },
  },
  {
    eyebrow: "OCT 2025",
    title: "ChatGPT Atlas ships",
    body: "OpenAI's agentic browser. A full Chromium running every site through the OWL layer. Atlas users see your post-JS DOM, including content rendered via React or Vue — but only if your site responds to the browser's slower, instrumented requests. The headless / raw-HTTP gap matters more now.",
    cite: {
      text: "OpenAI: Building ChatGPT Atlas",
      href: "https://openai.com/index/building-chatgpt-atlas/",
    },
  },
  {
    eyebrow: "AUG 2025",
    title: "Perplexity Comet",
    body: "Perplexity's Chromium-based agent browser. Fetches your docs as a logged-in human would. Different sample of your traffic than the declared PerplexityBot — and they read differently.",
    cite: {
      text: "Comet engine",
      href: "https://comet-help.perplexity.ai/en/articles/11583798-what-is-comet-s-browser-engine",
    },
  },
  {
    eyebrow: "ONGOING",
    title: "MCP, Agent Skills, A2A",
    body: "A new layer of well-known endpoints emerged: /.well-known/mcp/server-card.json, /.well-known/agent-skills/index.json, /.well-known/agent-card.json. Agents discover capabilities programmatically. The docs site that publishes a manifest gets called by agents trying to do real work; the docs site that doesn't is invisible to that path.",
  },
];

const VS: Array<{ tool: string; angle: string; we: string }> = [
  {
    tool: "Cloudflare's isitagentready.com",
    angle: "Probes ~13 endpoints + WebMCP detection. Punitive scoring (Level 0 / Not Ready) — most docs sites start at 8/100.",
    we: "We run 38 checks but score honestly: missing optional endpoints don't penalize. We also show how three different agent reader populations actually read your content, not just whether endpoints exist.",
  },
  {
    tool: "buildwithfern's agent-score",
    angle: "22 checks, polished UI, 87/100 for ekline. The AI-readiness audit Fern is best known for.",
    we: "Same audit surface, plus the visual hook: side-by-side rendered page vs three agent reads (Raw HTTP, Headless, Snippet) per page. Fern has a single agent-class lens; we show divergence.",
  },
  {
    tool: "afdocs (npx afdocs check)",
    angle: "Open-source CLI for the AFDocs Spec. Canonical rubric. Best for CI integration.",
    we: "We run a superset (38 checks vs afdocs's 23, with 17 shared IDs). Our agent-fix prompt points users at the pinned `npx afdocs@0.18 check` for an independent read; the alignment audit at docs/audits/afdocs-rubric.md shows current drift.",
  },
];

export default function WhyPage() {
  return (
    <div className="min-h-screen flex flex-col bg-paper">
      <SiteHeader />

      <main className="flex-1 flex flex-col">
        {/* Hero */}
        <section className="relative px-6 pt-14 pb-12 overflow-hidden">
          <div className="absolute inset-0 -z-10 bg-gradient-to-br from-paper-tint/40 via-paper to-paper" />
          <div className="max-w-[1100px] mx-auto">
            <div className="inline-flex items-center gap-2 mb-5 chip">
              <span className="w-1.5 h-1.5 rounded-full bg-accent" />
              <span className="mono text-[10.5px] uppercase tracking-[0.12em]">
                why this tool exists
              </span>
            </div>
            <h1 className="h-display h-navy text-[40px] md:text-[60px] leading-[1.02] mb-5 max-w-3xl">
              Your docs have <span className="accent-underline">a second audience.</span>
            </h1>
            <p className="text-[16px] md:text-[17px] text-ink/75 max-w-3xl leading-relaxed">
              For thirty years, docs were written for humans, scored by Google, and graded on
              search rankings. That contract changed in 2024-2026. The new audience —
              <strong className="text-ink"> coding agents, browsing agents, and answer engines</strong> — reads
              the same pages very differently. None of them care about your branding or your
              fonts; all of them care about whether your content is reachable, parseable, and
              tagged.
            </p>
          </div>
        </section>

        {/* The shift */}
        <section className="px-6 py-12 border-t border-rule">
          <div className="max-w-[1100px] mx-auto">
            <div className="flex items-baseline gap-3 mb-2">
              <span className="text-[10.5px] uppercase tracking-[0.12em] text-ink/45 mono">
                SECTION 01 · WHAT CHANGED
              </span>
            </div>
            <h2 className="h-display text-[26px] h-navy mb-6">Four shifts in twelve months.</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {SHIFTS.map((s) => (
                <article
                  key={s.title}
                  className="card p-5 hover:shadow-card-lift transition-shadow"
                >
                  <div className="text-[10.5px] uppercase tracking-[0.12em] text-ink/45 mono mb-2">
                    {s.eyebrow}
                  </div>
                  <h3 className="text-[16px] font-bold h-navy mb-2">{s.title}</h3>
                  <p className="text-[13px] text-ink/75 leading-relaxed">{s.body}</p>
                  {s.cite && (
                    <a
                      href={s.cite.href}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-block mt-3 text-[11px] text-ink/50 italic hover:text-accent transition-colors"
                    >
                      ↗ {s.cite.text}
                    </a>
                  )}
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* Why this tool */}
        <section className="px-6 py-12 border-t border-rule bg-paper-dim/30">
          <div className="max-w-[1100px] mx-auto">
            <div className="flex items-baseline gap-3 mb-2">
              <span className="text-[10.5px] uppercase tracking-[0.12em] text-ink/45 mono">
                SECTION 02 · OUR ANGLE
              </span>
            </div>
            <h2 className="h-display text-[26px] h-navy mb-3">
              The three readings nobody shows you side by side.
            </h2>
            <p className="text-[14px] text-ink/75 max-w-3xl leading-relaxed mb-6">
              Other AI-readiness tools tell you whether an endpoint exists. Useful, but
              one-dimensional. <strong className="text-ink">Docs Lens</strong> shows you what
              three real agent reader populations actually receive when they fetch your page —
              and where they diverge from each other and from what you see in a browser. The
              divergence is the lesson.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Pillar
                title="Substance over score"
                body="No gamified Level 0 / Not Ready rhetoric. The grade is a footer-level shareability handle. The headline is a verdict sentence and an audit trail."
              />
              <Pillar
                title="Cited, not assumed"
                body="Every profile names the agents it represents — Claude Code WebFetch, ChatGPT Atlas, Perplexity Comet — with linked release notes. No hand-waving."
              />
              <Pillar
                title="Re-runnable by hand"
                body="Each finding shows the literal HTTP request and response that produced it. Skeptical? curl the URL yourself. Every claim ties to a real fetch or a Playwright snapshot."
              />
            </div>
          </div>
        </section>

        {/* vs the field */}
        <section className="px-6 py-12 border-t border-rule">
          <div className="max-w-[1100px] mx-auto">
            <div className="flex items-baseline gap-3 mb-2">
              <span className="text-[10.5px] uppercase tracking-[0.12em] text-ink/45 mono">
                SECTION 03 · WHERE WE FIT
              </span>
            </div>
            <h2 className="h-display text-[26px] h-navy mb-3">
              How we compare to the other AI-readiness tools.
            </h2>
            <p className="text-[14px] text-ink/75 max-w-3xl leading-relaxed mb-6">
              We&apos;re not trying to replace these tools — they&apos;re good. We&apos;re the
              visual-first complement: the tool you run when you want to <em>see</em> what
              agents see, not just whether an endpoint passes a probe.
            </p>
            <div className="space-y-4">
              {VS.map((v) => (
                <div key={v.tool} className="card p-5">
                  <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-4">
                    <div>
                      <div className="text-[10.5px] uppercase tracking-[0.12em] text-ink/45 mono mb-1">
                        AGAINST
                      </div>
                      <div className="text-[14px] font-bold text-ink">{v.tool}</div>
                    </div>
                    <div className="space-y-2">
                      <div>
                        <div className="text-[10.5px] uppercase tracking-[0.12em] text-ink/45 mono mb-1">
                          THEIR ANGLE
                        </div>
                        <p className="text-[13px] text-ink/75 leading-relaxed">{v.angle}</p>
                      </div>
                      <div>
                        <div className="text-[10.5px] uppercase tracking-[0.12em] text-ink/45 mono mb-1">
                          OUR ANGLE
                        </div>
                        <p className="text-[13px] text-ink/85 leading-relaxed">{v.we}</p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="px-6 py-14 border-t border-rule bg-gradient-to-br from-paper to-paper-tint/40">
          <div className="max-w-[1100px] mx-auto text-center">
            <h2 className="h-display text-[28px] md:text-[34px] h-navy mb-4 max-w-2xl mx-auto leading-tight">
              See what your docs look like to the second audience.
            </h2>
            <p className="text-[14px] text-ink/65 mb-6 max-w-xl mx-auto">
              Pick a docs URL, watch three agent populations read it, get a prompt to fix
              what&apos;s broken.
            </p>
            <div className="flex items-center justify-center gap-3 flex-wrap">
              <Link href="/" className="btn-accent">
                Paste a URL →
              </Link>
              <Link href="/methodology" className="btn-subtle">
                Read the methodology
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
            <Link href="/methodology" className="hover:text-accent transition-colors">
              Methodology
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

function Pillar({ title, body }: { title: string; body: string }) {
  return (
    <div className="card p-5">
      <h3 className="text-[15px] font-bold text-ink mb-2">{title}</h3>
      <p className="text-[12.5px] text-ink/70 leading-relaxed">{body}</p>
    </div>
  );
}
