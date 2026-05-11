"use client";

import { useState } from "react";
import type { PageResult } from "@/lib/core/run-types";

type TabId = "rawHttp" | "headless" | "snippet";

const TABS: ReadonlyArray<{ id: TabId; label: string; who: string }> = [
  {
    id: "rawHttp",
    label: "Raw HTTP",
    who: "Claude Code · Cursor · Continue · Aider",
  },
  {
    id: "headless",
    label: "Headless browser",
    who: "Atlas · Comet · Cline · Roo Code",
  },
  {
    id: "snippet",
    label: "Search snippet",
    who: "ChatGPT Search · Perplexity · You.com",
  },
];

interface Props {
  page: PageResult;
}

/**
 * Two-column page drilldown: rendered iframe on the left, tabbed agent-view
 * markdown panel on the right. Tabs switch between Raw HTTP / Headless /
 * Snippet so users can see how each agent population reads the same page.
 *
 * A divergence callout surfaces when Raw HTTP saw materially less than
 * Headless on this page — the visual hook for "your docs are JS-gated."
 */
export function PageDrilldownTwoColumn({ page }: Props) {
  const [active, setActive] = useState<TabId>("rawHttp");

  const rawChars = page.profiles.rawHttp?.chars ?? 0;
  const headlessChars = page.profiles.headless?.chars ?? 0;
  const divergencePct =
    headlessChars > 0
      ? Math.max(
          0,
          Math.min(
            100,
            Math.round(((headlessChars - rawChars) / headlessChars) * 100),
          ),
        )
      : 0;

  const showDivergence = divergencePct >= 30;

  const md =
    page.profiles[active]?.markdown ?? "(no output for this profile)";
  const activeTab = TABS.find((t) => t.id === active);
  const activeChars = page.profiles[active]?.chars ?? 0;

  return (
    <section className="px-6 py-8 border-b border-rule">
      <div className="max-w-[1300px] mx-auto">
        {/* URL pill */}
        <div className="mb-4 flex items-baseline gap-3 flex-wrap">
          <span className="text-[10.5px] uppercase tracking-[0.12em] text-ink/45 mono">
            PAGE DRILLDOWN
          </span>
          <a
            href={page.url}
            target="_blank"
            rel="noreferrer"
            className="mono text-[12.5px] text-ink/85 px-3 py-1 rounded-full border border-rule bg-paper-dim/50 hover:border-accent/40 hover:text-accent transition-colors truncate max-w-2xl"
            title={page.url}
          >
            {page.url}
          </a>
        </div>

        {showDivergence && (
          <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50/60 px-4 py-3 text-[12.5px] text-amber-900 flex items-start gap-2">
            <span className="text-base leading-none mt-0.5">⚠️</span>
            <span>
              Raw HTTP saw <strong>{100 - divergencePct}%</strong> of what Headless saw on this
              page. The missing <strong>{divergencePct}%</strong> is rendered by JavaScript that
              Raw HTTP doesn&apos;t execute.
            </span>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Left: rendered page (screenshot from headless profile). When no
              screenshot exists, we show an explicit empty state rather than
              an <iframe src={page.url}> — most docs sites set X-Frame-Options
              or frame-ancestors, so iframe embeds rendered as the empty-doc
              error icon instead of the page. */}
          <div className="border border-rule rounded-xl overflow-hidden bg-paper-dim/30">
            <div className="px-4 py-2.5 border-b border-rule flex items-center justify-between gap-2">
              <span className="text-[10.5px] uppercase tracking-[0.12em] text-ink/55 mono">
                What you see
              </span>
              <span className="text-[10.5px] mono text-ink/40">
                {page.profiles.headless?.screenshot
                  ? "headless screenshot"
                  : "no screenshot"}
              </span>
              <a
                href={page.url}
                target="_blank"
                rel="noreferrer"
                className="text-[10.5px] text-ink/55 hover:text-accent ml-auto"
                title="Open in a new tab"
              >
                open ↗
              </a>
            </div>
            {page.profiles.headless?.screenshot ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={page.profiles.headless.screenshot}
                alt={`Headless render of ${page.url}`}
                className="w-full h-[600px] object-contain object-top bg-white"
              />
            ) : (
              <NoScreenshotState
                url={page.url}
                reason={page.profiles.headless?.reason}
              />
            )}
          </div>

          {/* Right: agent view */}
          <div className="border border-rule rounded-xl overflow-hidden bg-[color:var(--color-agent-bg)]">
            <div className="flex border-b border-white/10 bg-[color:var(--color-agent-bg)]">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setActive(t.id)}
                  className={`flex-1 px-3 py-2.5 text-[11.5px] font-semibold transition-colors border-r border-white/10 last:border-r-0 ${
                    active === t.id
                      ? "text-white bg-white/[0.06]"
                      : "text-[color:var(--color-agent-muted)] hover:text-white"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <div className="px-4 py-2.5 border-b border-white/10 flex items-center justify-between gap-2">
              <span className="text-[10.5px] uppercase tracking-[0.12em] text-[color:var(--color-agent-muted)] mono truncate">
                What {activeTab?.who} see
              </span>
              <span className="text-[10.5px] mono text-[color:var(--color-agent-muted)] shrink-0">
                {activeChars.toLocaleString()} chars
              </span>
            </div>
            <pre className="agent-scroll p-4 whitespace-pre-wrap text-[12px] leading-[1.65] font-mono text-[color:var(--color-agent-fg)] h-[540px] overflow-y-auto">
              {md}
            </pre>
          </div>
        </div>
      </div>
    </section>
  );
}

function NoScreenshotState({ url, reason }: { url: string; reason?: string }) {
  const isSkipped = reason?.startsWith("Skipped");
  const headline = isSkipped
    ? "Headless render unavailable on this host"
    : "No screenshot for this page";
  const detail = isSkipped
    ? "The hosted demo runs a slimmed Chromium that may not be active for this scan. Run docs-lens locally to see the rendered view, or open the page in a new tab below."
    : reason ?? "The headless profile didn't capture a screenshot for this page.";
  return (
    <div className="w-full h-[600px] bg-white flex items-center justify-center p-8">
      <div className="max-w-sm text-center">
        <div className="mx-auto mb-4 w-10 h-10 rounded-full border border-rule flex items-center justify-center text-ink/35">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-5 h-5"
            aria-hidden="true"
          >
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <path d="M3 17l5-5 4 4 3-3 6 6" />
          </svg>
        </div>
        <div className="text-[13px] font-semibold text-ink/85 mb-2">{headline}</div>
        <p className="text-[12px] text-ink/55 leading-relaxed mb-4">{detail}</p>
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-[12px] text-accent hover:underline"
        >
          Open page in new tab ↗
        </a>
      </div>
    </div>
  );
}
