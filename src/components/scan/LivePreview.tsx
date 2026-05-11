"use client";

import { useEffect, useState } from "react";
import type { ProfileId } from "@/lib/core/types";
import type { PageResult, RunResult } from "@/lib/core/run-types";
import type { ScanState } from "@/hooks/useScanRun";

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
  runId: string | null;
  state: ScanState;
}

interface SnapshotResponse {
  result: RunResult | null;
}

/**
 * Live "while you wait" preview shown during an active scan. Renders the
 * user's actual site in an iframe on the left, plus the three agent views
 * on the right. Polls the snapshot endpoint to surface real markdown as
 * soon as the first page's profiles complete.
 *
 * Falls back to a "fetching…" caption in the right panel until the first
 * page finishes its profile fan-out.
 */
function findFirstPageWithMarkdown(result: RunResult | null | undefined): PageResult | null {
  if (!result) return null;
  return (
    result.pages?.find(
      (p) => p?.profiles?.rawHttp?.markdown && p.profiles.rawHttp.markdown.length > 0,
    ) ?? null
  );
}

export function LivePreview({ runId, state }: Props) {
  const [active, setActive] = useState<TabId>("rawHttp");
  const [polledPage, setPolledPage] = useState<PageResult | null>(null);

  // Source of truth, in order of preference:
  //   1. The completed result on state (set after run:done by useScanRun).
  //   2. A page we polled out of /api/scan/{id} mid-run.
  // The completed result wins because it's strictly newer than polled snapshots.
  const resultPage = findFirstPageWithMarkdown(state.result);
  const firstPage = resultPage ?? polledPage;

  // Pick a URL to preview. After discover, we have `state.discover.pages[0]`
  // which is the seed (BFS) or first sitemap entry. That's the one we expect
  // to finish first.
  const previewUrl = state.discover?.pages?.[0] ?? null;
  const totalPages = state.totalPages;
  const pagesDone = state.pagesDone;

  // Poll the snapshot endpoint every 1.5s until we have a page with markdown.
  // Runs both during the scan AND after completion if useScanRun's deferred
  // snapshot-fetch hasn't populated state.result yet.
  //
  // On serverless hosts (Vercel sync-scan path) the snapshot endpoint
  // structurally 404s — there's no server-side run record. useScanRun
  // hydrates state.result from sessionStorage instead, so we just wait
  // for that one tick rather than making the doomed network call.
  const isSyncMode = !!process.env.NEXT_PUBLIC_VERCEL_ENV;
  useEffect(() => {
    if (!runId) return;
    if (firstPage) return; // already have data from poll or state.result
    if (isSyncMode) return;

    let cancelled = false;
    let timeout: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      try {
        const res = await fetch(`/api/scan/${encodeURIComponent(runId)}`);
        if (!res.ok) {
          if (!cancelled) timeout = setTimeout(tick, 2000);
          return;
        }
        const json = (await res.json()) as SnapshotResponse;
        if (cancelled) return;
        const candidate = findFirstPageWithMarkdown(json.result);
        if (candidate) {
          setPolledPage(candidate);
          return;
        }
        timeout = setTimeout(tick, 1500);
      } catch {
        if (!cancelled) timeout = setTimeout(tick, 2500);
      }
    };

    tick();
    return () => {
      cancelled = true;
      if (timeout) clearTimeout(timeout);
    };
  }, [runId, firstPage]);

  const activeTab = TABS.find((t) => t.id === active);
  const md = firstPage?.profiles[active as ProfileId]?.markdown ?? null;
  const activeChars = firstPage?.profiles[active as ProfileId]?.chars ?? 0;
  const previewedPageUrl = firstPage?.url ?? previewUrl;

  const isRunning = state.status === "running" || state.status === "loading";
  const eyebrow = isRunning
    ? `live preview · ${pagesDone}/${totalPages || "?"} pages scanned`
    : `the visual hook · ${state.pages.length} page${state.pages.length === 1 ? "" : "s"} scanned`;
  const subtitle = isRunning
    ? "Showing what each agent population sees on"
    : "Click any tab to compare what each agent population sees on";

  return (
    <section className="px-6 pt-10 pb-12 border-b border-rule bg-gradient-to-br from-paper-tint/30 via-paper to-paper">
      <div className="max-w-[1100px] mx-auto">
        <div className="inline-flex items-center gap-2 mb-4 chip">
          <span className={`w-1.5 h-1.5 rounded-full bg-accent ${isRunning ? "animate-pulse" : ""}`} />
          <span className="mono text-[10.5px] uppercase tracking-[0.12em]">
            {eyebrow}
          </span>
        </div>
        <h2 className="h-display h-navy text-[22px] md:text-[28px] leading-tight mb-2 max-w-2xl">
          Same page, three very different reads.
        </h2>
        <p className="text-[13.5px] text-ink/65 mb-6 max-w-2xl">
          {subtitle}{" "}
          <span className="mono text-ink/85">
            {previewedPageUrl
              ? new URL(previewedPageUrl).pathname || "/"
              : "your site"}
          </span>
          {isRunning ? ". Once the scan completes you'll get this view for every page." : ". Use the page matrix below to drill into any other page."}
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Left: rendered page. We never embed the target page via <iframe>
              src={previewedPageUrl}> — most docs sites set X-Frame-Options
              or frame-ancestors and the embed renders as a blocked icon.
              Show the headless screenshot when it lands; otherwise an
              honest "rendering" / "discovering" placeholder. */}
          <div className="border border-rule rounded-xl overflow-hidden bg-paper-dim/30">
            <div className="px-4 py-2.5 border-b border-rule flex items-center justify-between gap-2">
              <span className="text-[10.5px] uppercase tracking-[0.12em] text-ink/55 mono">
                What you see
              </span>
              <span className="text-[10.5px] mono text-ink/40">
                {firstPage?.profiles?.headless?.screenshot
                  ? "headless screenshot"
                  : previewedPageUrl
                    ? firstPage?.profiles?.headless?.ok === false
                      ? "no screenshot"
                      : "rendering"
                    : "waiting for discovery"}
              </span>
              {previewedPageUrl && (
                <a
                  href={previewedPageUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[10.5px] text-ink/55 hover:text-accent ml-auto"
                  title="Open in a new tab"
                >
                  open ↗
                </a>
              )}
            </div>
            {firstPage?.profiles?.headless?.screenshot ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={firstPage.profiles.headless.screenshot}
                alt={`Headless render of ${previewedPageUrl}`}
                className="w-full h-[560px] object-contain object-top bg-white"
              />
            ) : previewedPageUrl ? (
              <PreviewPlaceholder
                url={previewedPageUrl}
                headlessReason={firstPage?.profiles?.headless?.reason}
                headlessFailed={firstPage?.profiles?.headless?.ok === false}
              />
            ) : (
              <div className="w-full h-[560px] bg-white flex items-center justify-center text-ink/40 text-[13px]">
                Discovering pages…
              </div>
            )}
          </div>

          {/* Right: agent views */}
          <div className="border border-rule rounded-xl overflow-hidden bg-[color:var(--color-agent-bg)]">
            <div className="flex border-b border-white/10">
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
                {md ? `${activeChars.toLocaleString()} chars` : "fetching…"}
              </span>
            </div>
            <pre className="agent-scroll p-4 whitespace-pre-wrap text-[12px] leading-[1.65] font-mono text-[color:var(--color-agent-fg)] h-[500px] overflow-y-auto">
              {md ?? <FetchingPlaceholder />}
            </pre>
          </div>
        </div>
      </div>
    </section>
  );
}

function FetchingPlaceholder() {
  return (
    <span className="text-[color:var(--color-agent-muted)]">
      Fetching what this reader sees…
      {"\n\n"}
      The agent views appear here as soon as the first page&apos;s profiles complete (usually
      within 5-10 seconds of scan start).
    </span>
  );
}

interface PreviewPlaceholderProps {
  url: string;
  headlessReason?: string;
  headlessFailed: boolean;
}

function PreviewPlaceholder({ url, headlessReason, headlessFailed }: PreviewPlaceholderProps) {
  const isSkipped = headlessReason?.startsWith("Skipped");
  const headline = headlessFailed
    ? isSkipped
      ? "Headless render unavailable on this host"
      : "Headless render failed for this page"
    : "Rendering the page in a headless browser…";
  const detail = headlessFailed
    ? isSkipped
      ? "Run docs-lens locally to see the rendered view, or open the page in a new tab."
      : headlessReason ?? "The browser couldn't load this page."
    : "The screenshot lands here as soon as the first page finishes rendering — typically 5–15 seconds.";
  return (
    <div className="w-full h-[560px] bg-white flex items-center justify-center p-8">
      <div className="max-w-sm text-center">
        <div className="mx-auto mb-4 w-10 h-10 rounded-full border border-rule flex items-center justify-center text-ink/35">
          {headlessFailed ? (
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
          ) : (
            <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
          )}
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
