"use client";

import { useEffect, useState } from "react";
import type {
  PageDiff,
  RunEvent,
  RunResult,
  SiteStats,
} from "@/lib/core/run-types";
import type { ProfileId } from "@/lib/core/types";
import type { FixFinding } from "@/lib/fix/types";
import { scanStateFromResult } from "@/lib/scan-state-from-result";
import { SNAPSHOT_KEY_PREFIX, decodeSnapshot } from "@/lib/snapshot-codec";

async function readCachedSnapshot(runId: string): Promise<RunResult | null> {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(SNAPSHOT_KEY_PREFIX + runId);
    if (!raw) return null;
    return await decodeSnapshot(raw);
  } catch {
    return null;
  }
}

interface DiscoverState {
  pages: string[];
  source: "sitemap" | "bfs";
  capped: boolean;
}

export interface PageProgress {
  url: string;
  index: number;
  /** Profile id → chars (filled in as profile:done events arrive). */
  charsByProfile: Partial<Record<ProfileId, number>>;
  /** Profile id → tokensClaude. */
  tokensByProfile: Partial<Record<ProfileId, number>>;
  diff?: PageDiff;
  done: boolean;
}

export interface ScanState {
  status: "loading" | "running" | "done" | "error" | "stopped";
  discover?: DiscoverState;
  pages: PageProgress[];
  pagesDone: number;
  totalPages: number;
  siteStats?: SiteStats;
  fixes: FixFinding[];
  errorMessage?: string;
  /** Non-fatal warnings surfaced during the run (e.g. afdocs sub-runner failed). */
  warnings?: string[];
  /** Reason text for a stopped run, e.g. "stopped after 3 of 250 pages". */
  stoppedReason?: string;
  /** Raw final RunResult once available. */
  result?: RunResult;
}

const initial: ScanState = {
  status: "loading",
  pages: [],
  pagesDone: 0,
  totalPages: 0,
  fixes: [],
};

/**
 * Subscribe to a run's SSE stream and assemble a live view of progress.
 *
 * The server replays accumulated events on connect, so a refreshed tab or
 * a deep-link navigation reaches the same state as a tab that was open
 * since the run started.
 */
export function useScanRun(runId: string | null): ScanState {
  const [state, setState] = useState<ScanState>(initial);

  useEffect(() => {
    if (!runId) return;
    let cancelled = false;
    let es: EventSource | null = null;

    // Sync-scan hydration: the homepage form may have stashed a complete
    // gzip+base64'd RunResult in sessionStorage (Vercel path, where SSE
    // doesn't work). If found, hydrate state from it and skip the live
    // stream entirely. Decompression is async, hence the IIFE.
    void (async () => {
      const cachedResult = await readCachedSnapshot(runId);
      if (cancelled) return;
      if (cachedResult) {
        setState(scanStateFromResult(cachedResult));
        return;
      }
      // We don't reset state on runId change here — Next's App Router
      // remounts the route component on a new /scan/[id] navigation, which
      // gives us fresh state for free. (Avoids the react-hooks/set-state-
      // in-effect lint rule that fires on imperative resets in effects.)
      if (cancelled) return;
      const url = `/api/scan/${encodeURIComponent(runId)}/stream`;
      es = new EventSource(url);
      let everSawDiscover = false;

      es.onmessage = (msg) => {
        let event: RunEvent;
        try {
          event = JSON.parse(msg.data) as RunEvent;
        } catch {
          return;
        }
        if (event.type === "discover") everSawDiscover = true;
        setState((prev) => apply(prev, event));
      };

      es.onerror = () => {
        // EventSource auto-retries on transient errors; a hard failure once
        // the run is done is normal (server closed the stream). Only surface
        // an error if we never even got the discover event.
        if (!everSawDiscover) {
          setState((prev) =>
            prev.status === "done"
              ? prev
              : {
                  ...prev,
                  status: "error",
                  errorMessage: "lost connection before scan started",
                },
          );
        }
        es?.close();
      };
    })();

    return () => {
      cancelled = true;
      es?.close();
    };
  }, [runId]);

  // After SSE closes on `run:done` or `run:stopped`, fetch the snapshot to
  // populate `result` (the snapshot also has the full per-page profile
  // markdown for drilldowns).
  useEffect(() => {
    if (
      !runId ||
      (state.status !== "done" && state.status !== "stopped") ||
      state.result
    )
      return;
    let cancelled = false;
    fetch(`/api/scan/${encodeURIComponent(runId)}`)
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        if (j?.result) setState((prev) => ({ ...prev, result: j.result as RunResult }));
      })
      .catch(() => {
        // best-effort; the live state already has everything the strip + matrix + fix list need
      });
    return () => {
      cancelled = true;
    };
  }, [runId, state.status, state.result]);

  return state;
}

function apply(prev: ScanState, e: RunEvent): ScanState {
  switch (e.type) {
    case "discover": {
      const pages = e.pages.map((url, i) => ({
        url,
        index: i,
        charsByProfile: {},
        tokensByProfile: {},
        done: false,
      }));
      return {
        ...prev,
        status: "running",
        discover: { pages: e.pages, source: e.source, capped: e.capped },
        pages,
        totalPages: e.pages.length,
      };
    }
    case "page:start":
      return prev;
    case "profile:done": {
      const pages = prev.pages.map((p) =>
        p.url === e.url
          ? {
              ...p,
              charsByProfile: { ...p.charsByProfile, [e.profile]: e.chars },
              tokensByProfile: { ...p.tokensByProfile, [e.profile]: e.tokensClaude },
            }
          : p,
      );
      return { ...prev, pages };
    }
    case "page:done": {
      const pages = prev.pages.map((p) =>
        p.url === e.url ? { ...p, diff: e.diff, done: true } : p,
      );
      return { ...prev, pages, pagesDone: prev.pagesDone + 1 };
    }
    case "run:done":
      return {
        ...prev,
        status: "done",
        siteStats: e.siteStats,
        fixes: e.fixes,
      };
    case "run:stopped":
      return {
        ...prev,
        status: "stopped",
        siteStats: e.siteStats,
        fixes: e.fixes,
        stoppedReason: e.reason,
      };
    case "run:error":
      return { ...prev, status: "error", errorMessage: e.message };
    case "warn":
      return { ...prev, warnings: [...(prev.warnings ?? []), e.message] };
  }
}
