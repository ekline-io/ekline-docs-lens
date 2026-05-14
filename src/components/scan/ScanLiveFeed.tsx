"use client";

import { useMemo } from "react";
import type { ScanState, PageProgress } from "@/hooks/useScanRun";
import type { ProfileId } from "@/lib/core/types";

interface Props {
  state: ScanState;
}

const MAX_VISIBLE = 8;

/**
 * Live feed of every page as it streams through the three reader profiles.
 * The wait between "click Scan" and "result hero appears" used to be a blank
 * counter; this turns it into a teaching moment — each page becomes a mini
 * object lesson in how the three readers diverge.
 *
 * Only renders while the scan is in flight. Once `status` flips to a
 * terminal state, the parent unmounts us and the post-scan blocks
 * (ProfileStatusCards, PageMatrix, etc.) take over.
 */
export function ScanLiveFeed({ state }: Props) {
  const visible = useMemo(() => orderForFeed(state.pages), [state.pages]);
  if (state.status !== "running" || visible.length === 0) return null;

  const total = state.totalPages || 0;
  const done = state.pagesDone;

  return (
    <section className="px-6 py-6 border-b border-rule bg-paper-tint/20">
      <div className="max-w-[1100px] mx-auto">
        <div className="flex items-baseline gap-3 mb-3 flex-wrap">
          <span className="text-[10.5px] uppercase tracking-[0.12em] text-ink/45 mono">
            What we&apos;re reading
          </span>
          <span className="text-[12px] text-ink/55 mono tabular-nums">
            pages {done} / {total}
          </span>
        </div>
        <ul className="space-y-1.5">
          {visible.map((p) => (
            <FeedRow key={p.url} page={p} />
          ))}
          {state.pages.length > visible.length && (
            <li className="text-[11px] text-ink/40 mono pl-7 pt-1">
              + {state.pages.length - visible.length} more queued
            </li>
          )}
        </ul>
      </div>
    </section>
  );
}

function FeedRow({ page }: { page: PageProgress }) {
  const fetching = !page.done && Object.keys(page.charsByProfile).length === 0;
  const inFlight = !page.done && Object.keys(page.charsByProfile).length > 0;
  const path = pathOf(page.url);
  return (
    <li className="flex items-center gap-3 text-[12.5px] leading-relaxed">
      <span className="w-4 shrink-0 inline-flex items-center justify-center">
        {page.done ? (
          <span className="text-emerald-600">✓</span>
        ) : inFlight ? (
          <span
            className="inline-block w-3 h-3 rounded-full border-2 border-accent border-t-transparent animate-spin"
            aria-label="fetching"
          />
        ) : fetching ? (
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-ink/30" aria-label="queued" />
        ) : null}
      </span>
      <span
        className={`truncate flex-1 min-w-0 ${
          page.done ? "text-ink/85" : "text-ink/95"
        }`}
        title={page.url}
      >
        {path}
      </span>
      <ReadingRow page={page} />
    </li>
  );
}

function ReadingRow({ page }: { page: PageProgress }) {
  if (!page.done && Object.keys(page.charsByProfile).length === 0) {
    return (
      <span className="text-[11px] text-ink/40 mono tabular-nums shrink-0">
        queued
      </span>
    );
  }
  const tone = toneForSpread(page.charsByProfile);
  return (
    <span className="shrink-0 flex items-center gap-3 mono text-[11px] tabular-nums">
      <ProfileChars id="rawHttp" label="Raw" chars={page.charsByProfile.rawHttp} tone={tone} />
      <ProfileChars
        id="headless"
        label="Headless"
        chars={page.charsByProfile.headless}
        tone={tone}
      />
      <ProfileChars id="snippet" label="Snippet" chars={page.charsByProfile.snippet} tone={tone} />
    </span>
  );
}

type Tone = "good" | "partial" | "broken" | "neutral";

function ProfileChars({
  id,
  label,
  chars,
  tone,
}: {
  id: ProfileId;
  label: string;
  chars: number | undefined;
  tone: Tone;
}) {
  if (chars === undefined) {
    return (
      <span className="text-ink/30">
        {label} <span className="ml-0.5 text-ink/30">…</span>
      </span>
    );
  }
  const valueClass =
    chars === 0
      ? "text-rose-700"
      : tone === "partial" && id === "rawHttp"
        ? "text-amber-700"
        : tone === "good"
          ? "text-emerald-700"
          : "text-ink/80";
  return (
    <span className="text-ink/50">
      {label} <span className={`${valueClass} font-semibold ml-0.5`}>{formatChars(chars)}</span>
    </span>
  );
}

/**
 * Decide the tone for a row's reader-profile numbers. We compare raw HTTP
 * vs headless because that's the canonical JS-gated-content signal —
 * snippets are intentionally tiny and don't carry signal.
 */
function toneForSpread(chars: PageProgress["charsByProfile"]): Tone {
  const r = chars.rawHttp;
  const h = chars.headless;
  if (r === undefined || h === undefined) return "neutral";
  if (r === 0 || h === 0) return "broken";
  if (h > 0 && r / h < 0.6) return "partial";
  return "good";
}

/**
 * Order pages for the feed: in-flight first (any profile reported but not
 * all done), then completed, then untouched-queued. Within each bucket,
 * higher index = more recent in discovery order, so it bubbles up.
 */
function orderForFeed(pages: PageProgress[]): PageProgress[] {
  const inFlight: PageProgress[] = [];
  const done: PageProgress[] = [];
  const queued: PageProgress[] = [];
  for (const p of pages) {
    if (p.done) done.push(p);
    else if (Object.keys(p.charsByProfile).length > 0) inFlight.push(p);
    else queued.push(p);
  }
  const byIndexDesc = (a: PageProgress, b: PageProgress) => b.index - a.index;
  inFlight.sort(byIndexDesc);
  done.sort(byIndexDesc);
  queued.sort(byIndexDesc);
  return [...inFlight, ...done, ...queued].slice(0, MAX_VISIBLE);
}

function pathOf(url: string): string {
  try {
    const u = new URL(url);
    const p = u.pathname === "/" ? "/" : u.pathname.replace(/\/$/, "");
    return p || "/";
  } catch {
    return url;
  }
}

function formatChars(n: number): string {
  if (n === 0) return "0";
  if (n >= 10_000) return `${Math.round(n / 1000)}k`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return `${n}`;
}
