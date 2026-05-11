"use client";

import Link from "next/link";
import { useState } from "react";
import type { PageProgress } from "@/hooks/useScanRun";
import { PROFILE_IDS } from "@/lib/core/types";
import type { ProfileId } from "@/lib/core/types";

interface Props {
  pages: PageProgress[];
  runId: string;
}

const PROFILE_LABELS: Record<ProfileId, string> = {
  rawHttp: "raw HTTP",
  headless: "headless",
  snippet: "snippet",
};

// Grid template: page label + three profile cells. The page column is the
// flex column that takes the slack; profile cells are fixed-narrow so the
// rows align across pages.
const GRID_COLS =
  "grid-cols-[minmax(220px,1fr)_repeat(3,minmax(110px,1fr))]";

/**
 * One row per scanned page, six profile columns. Each row is a real `<a>`
 * (via `Link`) once the page has finished, so keyboard navigation, hover,
 * and right-click "open in new tab" all work the way the OS expects.
 *
 * Layout uses CSS grid rather than `<table>` because each row links to the
 * per-page drilldown — wrapping rows of a real `<table>` in an `<a>` tag
 * is not valid HTML.
 */
export function PageMatrix({ pages, runId }: Props) {
  const [expanded, setExpanded] = useState(false);

  if (pages.length === 0) {
    return (
      <section className="px-6 py-10">
        <div className="max-w-[1200px] mx-auto text-center text-ink/50 text-sm">
          Discovering pages…
        </div>
      </section>
    );
  }

  return (
    <section className="px-6 py-8 border-b border-rule">
      <div className="max-w-[1200px] mx-auto">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="w-full flex items-center justify-between gap-3 text-left card px-4 py-3 hover:border-ink/30 transition-colors"
          aria-expanded={expanded}
        >
          <div className="flex items-baseline gap-3 flex-wrap">
            <span className="text-[15px] font-semibold text-ink">
              Page matrix · {pages.length} {pages.length === 1 ? "page" : "pages"}
            </span>
            <span className="text-[11.5px] text-ink/45">
              {expanded
                ? "click any row for the per-reader drilldown"
                : "see how each agent reader handled every page"}
            </span>
          </div>
          <span
            className={`text-ink/50 mono text-[11px] transition-transform ${
              expanded ? "rotate-180" : ""
            }`}
          >
            ▾
          </span>
        </button>
        {expanded && (
          <div className="card overflow-hidden mt-2">
            <div className="overflow-x-auto">
              <div className="min-w-[800px]">
                <Header />
                <div role="rowgroup">
                  {pages.map((p) => (
                    <Row key={p.url} page={p} runId={runId} />
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function Header() {
  return (
    <div
      role="row"
      className={`grid ${GRID_COLS} gap-0 bg-paper-dim/60 border-b border-rule`}
    >
      <Cell role="columnheader" className="text-left">
        Page
      </Cell>
      {PROFILE_IDS.map((id) => (
        <Cell key={id} role="columnheader" className="text-right">
          {PROFILE_LABELS[id]}
        </Cell>
      ))}
    </div>
  );
}

function Row({ page, runId }: { page: PageProgress; runId: string }) {
  const max = Math.max(
    1,
    ...PROFILE_IDS.map((id) => page.charsByProfile[id] ?? 0),
  );
  const linkable = page.done && runId;
  const href = linkable
    ? `/scan/${encodeURIComponent(runId)}/page/${page.index}`
    : null;

  const rowClass = `grid ${GRID_COLS} gap-0 border-b border-rule last:border-b-0 transition-colors`;
  const interactiveClass = href
    ? "hover:bg-paper-dim/40 cursor-pointer"
    : "";

  const rowBody = (
    <>
      <div className="px-3 py-2 align-middle text-[12.5px] flex items-center">
        <span className="truncate text-ink/85" title={page.url}>
          {prettyPath(page.url)}
        </span>
      </div>
      {PROFILE_IDS.map((id) => {
        const chars = page.charsByProfile[id];
        const tokens = page.tokensByProfile[id];
        const fraction = chars ? chars / max : 0;
        return (
          <div
            key={id}
            className="px-3 py-2 text-[12.5px] flex items-center justify-end whitespace-nowrap"
          >
            {chars === undefined ? (
              <span className="text-ink/30">…</span>
            ) : chars === 0 ? (
              <span className="text-ink/30">0</span>
            ) : (
              <div className="flex items-center justify-end gap-2">
                <span className="text-ink/45 tabular-nums text-[11px]">
                  ≈{tokens ?? "?"}
                </span>
                <span className="tabular-nums text-ink/85">
                  {formatChars(chars)}
                </span>
                <span className="inline-block w-10 h-1.5 bg-paper-dim rounded-full overflow-hidden">
                  <span
                    className="block h-full bg-accent rounded-full"
                    style={{ width: `${Math.round(fraction * 100)}%` }}
                  />
                </span>
              </div>
            )}
          </div>
        );
      })}
    </>
  );

  if (href) {
    return (
      <Link
        role="row"
        href={href}
        className={`${rowClass} ${interactiveClass} text-ink no-underline`}
        aria-label={`Inspect ${prettyPath(page.url)} across six reader profiles`}
      >
        {rowBody}
      </Link>
    );
  }
  return (
    <div role="row" className={rowClass}>
      {rowBody}
    </div>
  );
}

function Cell({
  children,
  role,
  className = "",
}: {
  children: React.ReactNode;
  role: string;
  className?: string;
}) {
  return (
    <div
      role={role}
      className={`px-3 py-2 font-medium text-ink/55 uppercase tracking-[0.08em] text-[10.5px] whitespace-nowrap ${className}`}
    >
      {children}
    </div>
  );
}

function prettyPath(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname + (u.search || "");
  } catch {
    return url;
  }
}

function formatChars(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}
