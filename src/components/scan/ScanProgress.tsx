"use client";

import { useEffect, useState } from "react";
import type { ScanState } from "@/hooks/useScanRun";

interface Props {
  state: ScanState;
  runId: string | null;
}

/**
 * Live status bar at the top of /scan/[id]. Shows discovery → page progress
 * → done. Accent color while running, neutral once finished.
 */
export function ScanProgress({ state, runId }: Props) {
  const [stopping, setStopping] = useState(false);
  const total = state.totalPages || 0;
  const done = state.pagesDone;
  const fraction = total ? done / total : 0;

  // The first time we see at least one page complete, we capture the
  // wall-clock time. From then on we extrapolate "time remaining" from the
  // pages-per-second rate. The estimate is best-effort — Playwright pages
  // vary widely in cost — so we round to ~10s and cap at 30 min for sanity.
  const [startedAt, setStartedAt] = useState<number | null>(null);
  useEffect(() => {
    if (state.status === "running" && done > 0 && startedAt === null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot timing anchor
      setStartedAt(Date.now());
    }
    if (state.status !== "running" && startedAt !== null) {
      setStartedAt(null);
    }
  }, [state.status, done, startedAt]);

  // Re-render every second while a scan is running so the ETA ticks. We
  // store `now` in state rather than calling Date.now() during render
  // (which would trip the react-hooks/purity rule).
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    if (state.status !== "running") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clear clock when status changes
      setNow(null);
      return;
    }
    const id = setInterval(() => setNow(Date.now()), 1000);
    // First tick ASAP so we don't wait a full second for the ETA to appear.
    const timeout = setTimeout(() => setNow(Date.now()), 0);
    return () => {
      clearInterval(id);
      clearTimeout(timeout);
    };
  }, [state.status]);

  const eta = computeEta(state.status, startedAt, done, total, now);

  let label = "Starting scan…";
  if (state.status === "error") label = state.errorMessage ?? "Scan failed";
  else if (state.status === "stopped") {
    label = state.stoppedReason
      ? `Stopped · ${state.stoppedReason}`
      : `Stopped · ${done} / ${total} pages`;
  } else if (state.discover && state.status === "running") {
    const progress = stopping ? "Stopping after current page" : `Scanning ${done} / ${total} pages`;
    label = `${progress} · ${state.discover.source}${state.discover.capped ? " · capped" : ""}`;
  } else if (state.status === "done") {
    label = `Scan complete · ${total} ${total === 1 ? "page" : "pages"}`;
  } else if (state.status === "running" && !state.discover) {
    label = "Discovering pages…";
  }

  async function onStop() {
    if (!runId || stopping) return;
    setStopping(true);
    try {
      await fetch(`/api/scan/${encodeURIComponent(runId)}`, { method: "DELETE" });
    } catch {
      // best-effort; the run-store flag-poll model means a successful POST is
      // not the only path — the runner picks up the flag on next loop tick
    }
  }

  return (
    <section className="px-6 py-3 bg-paper border-b border-rule">
      <div className="max-w-[1200px] mx-auto flex items-center gap-4 flex-wrap">
        <span
          className={`w-1.5 h-1.5 rounded-full ${
            state.status === "running"
              ? "bg-accent-bright animate-pulse"
              : state.status === "done"
                ? "bg-[color:var(--color-pass-ring)]"
                : state.status === "error"
                  ? "bg-[color:var(--color-fail-ring)]"
                  : state.status === "stopped"
                    ? "bg-[color:var(--color-warn-ring)]"
                    : "bg-ink/30"
          }`}
        />
        <span className="text-[13px] text-ink/80">{label}</span>
        {eta && state.status === "running" && !stopping && (
          <span className="text-[11.5px] text-ink/45 tabular-nums">
            · {eta} remaining
          </span>
        )}
        {state.status === "running" && runId && (
          <button
            type="button"
            onClick={onStop}
            disabled={stopping}
            className="ml-2 text-[11.5px] font-medium text-[color:var(--color-fail-ring)] hover:underline disabled:opacity-60"
          >
            {stopping ? "stopping…" : "Stop scan"}
          </button>
        )}
        {total > 0 && (
          <span className="flex-1 max-w-[400px] h-1.5 bg-paper-dim rounded-full overflow-hidden ml-auto">
            <span
              className={`block h-full rounded-full transition-[width] duration-300 ${
                state.status === "done"
                  ? "bg-[color:var(--color-pass-ring)]"
                  : "bg-accent"
              }`}
              style={{ width: `${Math.round(fraction * 100)}%` }}
            />
          </span>
        )}
      </div>
    </section>
  );
}

function computeEta(
  status: ScanState["status"],
  startedAt: number | null,
  done: number,
  total: number,
  now: number | null,
): string | null {
  if (status !== "running" || now === null) return null;
  if (!startedAt || done < 1 || total < 2) return null;
  const remaining = total - done;
  if (remaining <= 0) return null;
  const elapsedMs = now - startedAt;
  if (elapsedMs <= 0) return null;
  const perPageMs = elapsedMs / done;
  const etaMs = perPageMs * remaining;
  if (etaMs < 5_000) return "<5s";
  if (etaMs < 60_000) return `~${Math.round(etaMs / 1000 / 5) * 5}s`;
  if (etaMs < 30 * 60_000) return `~${Math.round(etaMs / 60_000)} min`;
  return ">30 min";
}
