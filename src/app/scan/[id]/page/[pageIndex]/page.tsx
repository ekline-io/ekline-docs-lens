"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { PageDrilldownTwoColumn } from "@/components/scan/PageDrilldownTwoColumn";
import { AllChecksList } from "@/components/scan/AllChecksList";
import type { RunResult } from "@/lib/core/run-types";
import { SNAPSHOT_KEY_PREFIX, decodeSnapshot } from "@/lib/snapshot-codec";

interface SnapshotResponse {
  id: string;
  status: "running" | "done" | "error";
  result: RunResult | null;
  errorMessage: string | null;
}

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

export default function PageDrilldownRoute() {
  const params = useParams<{ id: string; pageIndex: string }>();
  const runId = params?.id ?? "";
  const idx = Number(params?.pageIndex ?? "0");

  const [snapshot, setSnapshot] = useState<SnapshotResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!runId) return;
    let cancelled = false;
    let timeout: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      try {
        const res = await fetch(`/api/scan/${encodeURIComponent(runId)}`);
        if (cancelled) return;
        if (!res.ok) {
          setError(`scan not found (HTTP ${res.status})`);
          return;
        }
        const json = (await res.json()) as SnapshotResponse;
        if (cancelled) return;
        setSnapshot(json);
        // Poll until the per-page profile data is on disk.
        if (
          json.status === "running" ||
          (json.result && !json.result.pages?.[idx]?.profiles)
        ) {
          timeout = setTimeout(tick, 1500);
        }
      } catch (e) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "snapshot fetch failed");
      }
    };

    // Sync-scan hydration (Vercel): the homepage stashed a gzip+base64'd
    // RunResult in sessionStorage. The server-side run-store can't span
    // function isolates, so /api/scan/<id> would 404 here — read from the
    // client cache first. On local dev (SSE path), sessionStorage is empty
    // and we fall through to the API + poll loop as before.
    void (async () => {
      const cached = await readCachedSnapshot(runId);
      if (cancelled) return;
      if (cached) {
        setSnapshot({
          id: runId,
          status: cached.status === "running" ? "running" : "done",
          result: cached,
          errorMessage: cached.errorMessage ?? null,
        });
        return;
      }
      void tick();
    })();

    return () => {
      cancelled = true;
      if (timeout) clearTimeout(timeout);
    };
  }, [runId, idx]);

  const page = snapshot?.result?.pages?.[idx];
  const pageChecks = page?.pageChecks ?? [];

  return (
    <div className="min-h-screen flex flex-col bg-paper">
      <header className="px-6 py-3 border-b border-rule">
        <div className="max-w-[1300px] mx-auto flex items-center gap-4 flex-wrap">
          <Link href="/" className="flex items-center gap-2.5 shrink-0">
            <span className="text-[15px] font-bold tracking-tight h-navy">
              Docs Lens
            </span>
          </Link>
          <Link
            href={runId ? `/scan/${encodeURIComponent(runId)}` : "/"}
            className="text-[12.5px] underline text-ink/65 hover:text-accent"
          >
            ← back to scan
          </Link>
          <h1 className="ml-auto text-[14px] font-semibold truncate max-w-2xl text-ink/80">
            {page?.url ?? "Loading…"}
          </h1>
        </div>
      </header>
      <main className="flex-1">
        {error ? (
          <ErrorState message={error} runId={runId} />
        ) : !snapshot || !page ? (
          <LoadingState
            label={
              snapshot?.status === "running"
                ? "Scan still running — drilldown becomes available once the page finishes."
                : "Loading per-page data…"
            }
          />
        ) : (
          <>
            <PageDrilldownTwoColumn page={page} />
            <AllChecksList checks={pageChecks} />
          </>
        )}
      </main>
    </div>
  );
}

function LoadingState({ label }: { label: string }) {
  return (
    <div className="px-6 py-20 text-center text-ink/55 text-sm">
      <div className="inline-flex items-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full bg-accent-bright animate-pulse" />
        {label}
      </div>
    </div>
  );
}

function ErrorState({ message, runId }: { message: string; runId: string }) {
  return (
    <div className="px-6 py-20 text-center">
      <div className="text-[14px] text-[color:var(--color-fail-ring)]/90 mb-3">
        {message}
      </div>
      <Link
        href={runId ? `/scan/${encodeURIComponent(runId)}` : "/"}
        className="btn-subtle"
      >
        Back to scan
      </Link>
    </div>
  );
}
