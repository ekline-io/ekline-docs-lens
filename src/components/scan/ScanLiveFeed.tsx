"use client";

import { useMemo } from "react";
import type { ScanState, PageProgress } from "@/hooks/useScanRun";
import type { ProfileId } from "@/lib/core/types";
import { formatChars } from "@/lib/format";
import { pathOf } from "@/lib/url-display";

interface Props {
  state: ScanState;
}

const MAX_VISIBLE = 8;
type Tone = "good" | "partial" | "broken" | "neutral";

/**
 * Live feed of every page as it streams through the three reader profiles.
 * Turns the multi-minute scan wait into a teaching moment — each row shows
 * three numbers, so the reader watches the homepage promise come true.
 */
export function ScanLiveFeed({ state }: Props) {
  const visible = useMemo(() => orderForFeed(state.pages), [state.pages]);
  if (state.status !== "running" || visible.length === 0) return null;

  return (
    <section className="px-6 py-6 border-b border-rule bg-paper-tint/20">
      <div className="max-w-[1100px] mx-auto">
        <div className="flex items-baseline gap-3 mb-3 flex-wrap">
          <span className="text-[10.5px] uppercase tracking-[0.12em] text-ink/45 mono">
            What we&apos;re reading
          </span>
          <span className="text-[12px] text-ink/55 mono tabular-nums">
            pages {state.pagesDone} / {state.totalPages || 0}
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

type PageStatus = "done" | "inFlight" | "queued";

function statusOf(page: PageProgress): PageStatus {
  if (page.done) return "done";
  if (Object.keys(page.charsByProfile).length > 0) return "inFlight";
  return "queued";
}

function FeedRow({ page }: { page: PageProgress }) {
  const status = statusOf(page);
  return (
    <li className="flex items-center gap-3 text-[12.5px] leading-relaxed">
      <span className="w-4 shrink-0 inline-flex items-center justify-center">
        <StatusIcon status={status} />
      </span>
      <span
        className={`truncate flex-1 min-w-0 ${
          status === "done" ? "text-ink/85" : "text-ink/95"
        }`}
        title={page.url}
      >
        {pathOf(page.url)}
      </span>
      <ReadingRow page={page} status={status} />
    </li>
  );
}

function StatusIcon({ status }: { status: PageStatus }) {
  if (status === "done") return <span className="text-emerald-600">✓</span>;
  if (status === "inFlight") {
    return (
      <span
        className="inline-block w-3 h-3 rounded-full border-2 border-accent border-t-transparent animate-spin"
        aria-label="fetching"
      />
    );
  }
  return <span className="inline-block w-1.5 h-1.5 rounded-full bg-ink/30" aria-label="queued" />;
}

function ReadingRow({ page, status }: { page: PageProgress; status: PageStatus }) {
  if (status === "queued") {
    return (
      <span className="text-[11px] text-ink/40 mono tabular-nums shrink-0">queued</span>
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
  return (
    <span className="text-ink/50">
      {label}{" "}
      <span className={`${charClass(chars, tone, id)} font-semibold ml-0.5`}>
        {formatChars(chars)}
      </span>
    </span>
  );
}

function charClass(chars: number, tone: Tone, id: ProfileId): string {
  if (chars === 0) return "text-rose-700";
  if (tone === "partial" && id === "rawHttp") return "text-amber-700";
  if (tone === "good") return "text-emerald-700";
  return "text-ink/80";
}

// Snippets are intentionally tiny and don't carry signal, so we compare raw
// HTTP vs headless for the JS-gated check.
function toneForSpread(chars: PageProgress["charsByProfile"]): Tone {
  const r = chars.rawHttp;
  const h = chars.headless;
  if (r === undefined || h === undefined) return "neutral";
  if (r === 0 || h === 0) return "broken";
  if (h > 0 && r / h < 0.6) return "partial";
  return "good";
}

function orderForFeed(pages: PageProgress[]): PageProgress[] {
  const inFlight: PageProgress[] = [];
  const done: PageProgress[] = [];
  const queued: PageProgress[] = [];
  for (const p of pages) {
    const s = statusOf(p);
    if (s === "done") done.push(p);
    else if (s === "inFlight") inFlight.push(p);
    else queued.push(p);
  }
  const byIndexDesc = (a: PageProgress, b: PageProgress) => b.index - a.index;
  inFlight.sort(byIndexDesc);
  done.sort(byIndexDesc);
  queued.sort(byIndexDesc);
  return [...inFlight, ...done, ...queued].slice(0, MAX_VISIBLE);
}
