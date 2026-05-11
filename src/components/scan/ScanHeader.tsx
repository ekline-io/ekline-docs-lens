"use client";

import Link from "next/link";
import { useState } from "react";
import type { ScanState } from "@/hooks/useScanRun";

interface Props {
  state: ScanState;
}

/**
 * Persistent header on /scan/[id]. Shows the scanned root URL, page count,
 * source (sitemap vs BFS), and elapsed time. The user shouldn't have to
 * scroll up or look at the URL bar to remember what they're looking at.
 */
export function ScanHeader({ state }: Props) {
  const root = state.result?.config.rootUrl;
  const pageCount = state.totalPages;
  const source = state.discover?.source ?? state.siteStats?.source;
  const capped = state.discover?.capped ?? state.siteStats?.capped;
  const startedAt = state.result?.startedAt;
  const finishedAt = state.result?.finishedAt;
  // Only show elapsed time once the run has finished — `Date.now()` during
  // render would force re-renders for every tick (and trips React's
  // `react-hooks/purity` rule). The progress bar carries live status.
  const elapsedMs =
    startedAt && finishedAt ? finishedAt - startedAt : null;

  return (
    <section className="bg-paper-dim/50 border-b border-rule">
      <div className="max-w-[1200px] mx-auto px-6 py-3 flex items-center gap-4 flex-wrap">
        <Link href="/" className="flex items-center gap-2.5 shrink-0">
          <span className="inline-block w-2 h-2 rounded-sm bg-accent" />
          <span className="text-[15px] font-bold tracking-tight h-navy">Docs Lens</span>
        </Link>
        <div className="flex items-baseline gap-2 flex-wrap min-w-0">
          {root ? (
            <a
              href={root}
              target="_blank"
              rel="noreferrer"
              className="text-[13px] text-ink/85 font-medium hover:text-accent transition-colors truncate max-w-[480px]"
              title={root}
            >
              {prettyHost(root)}
            </a>
          ) : (
            <span className="text-[13px] text-ink/45">scanning…</span>
          )}
          <Stat label={`${pageCount || "?"} pages`} />
          {source && <Stat label={`via ${source}${capped ? " · capped" : ""}`} />}
          {elapsedMs !== null && <Stat label={formatDuration(elapsedMs)} />}
        </div>
        <div className="flex items-center gap-2 ml-auto shrink-0">
          <CopyLinkButton />
          <Link href="/" className="btn-subtle">
            <PlusIcon /> New scan
          </Link>
          <Link
            href="/methodology"
            className="btn-subtle hidden sm:inline-flex"
          >
            Methodology
          </Link>
        </div>
      </div>
    </section>
  );
}

function CopyLinkButton() {
  const [state, setState] = useState<"idle" | "copied" | "error">("idle");
  const onClick = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setState("copied");
      setTimeout(() => setState("idle"), 1500);
    } catch {
      setState("error");
      setTimeout(() => setState("idle"), 1500);
    }
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className={`btn-subtle ${state === "copied" ? "border-emerald-500/40 text-emerald-700" : ""}`}
      aria-live="polite"
    >
      {state === "copied" ? (
        <>
          <CheckIcon /> Copied
        </>
      ) : state === "error" ? (
        <>copy failed</>
      ) : (
        <>
          <LinkIcon /> Copy link
        </>
      )}
    </button>
  );
}

function PlusIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function Stat({ label }: { label: string }) {
  return (
    <span className="text-[12px] text-ink/55 tabular-nums">
      <span className="text-ink/30 mx-1">·</span>
      {label}
    </span>
  );
}

function prettyHost(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname === "/" ? "" : u.pathname;
    return u.host + path;
  } catch {
    return url;
  }
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  const s = Math.round(ms / 100) / 10;
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = Math.round(s - m * 60);
  return `${m}m ${rem}s`;
}
