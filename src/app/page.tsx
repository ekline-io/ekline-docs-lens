"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { HomepageDemo } from "@/components/HomepageDemo";
import type { RunResult } from "@/lib/core/run-types";
import { SNAPSHOT_KEY_PREFIX, clearOldSnapshots, encodeSnapshot } from "@/lib/snapshot-codec";

// On Vercel each page costs ~15-25s (per-page Chromium recycle + render).
// The edge proxy severs the connection at ~5 min regardless of function
// duration, so 5 pages × 25s = 125s is a safe ceiling. Heavy sites
// (Stripe, GitBook with screenshots) hit the edge timeout at 8+ pages.
// Local dev keeps the full 50-page ceiling.
const SYNC_DEFAULT_CAP = 5;
const SYNC_MAX_CAP = 5;
const LOCAL_DEFAULT_CAP = 10;
const LOCAL_MAX_CAP = 50;

const EXAMPLE_URLS = [
  { label: "Stripe", url: "https://docs.stripe.com/api" },
  { label: "Vercel", url: "https://vercel.com/docs" },
  { label: "EkLine", url: "https://docs.ekline.io/" },
];

// On Vercel (and any host without a long-lived process) we run the scan
// synchronously inside one request and hydrate /scan/[id] from a snapshot
// stashed in sessionStorage. Local dev keeps the live SSE stream.
const SYNC_SCAN = !!process.env.NEXT_PUBLIC_VERCEL_ENV;
const SCAN_ENDPOINT = SYNC_SCAN ? "/api/scan/sync" : "/api/scan";
const MAX_CAP = SYNC_SCAN ? SYNC_MAX_CAP : LOCAL_MAX_CAP;
const DEFAULT_CAP = SYNC_SCAN ? SYNC_DEFAULT_CAP : LOCAL_DEFAULT_CAP;

function estimatedSeconds(pages: number): string {
  // Hosted demo runs Chromium via @sparticuz/chromium-min and recycles
  // the browser process per page (avoids socket / FD exhaustion in
  // single-process mode). Cold start ~10-15s + per-page ~10-20s.
  const lo = 10 + pages * 10;
  const hi = 15 + pages * 20;
  return `${lo}–${hi}s`;
}

export default function Page() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [cap, setCap] = useState(DEFAULT_CAP);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = url.trim();
      if (!trimmed) return;
      try {
        new URL(trimmed);
      } catch {
        setError("That doesn't look like a valid URL. Include the protocol, for example https://docs.stripe.com/api.");
        return;
      }
      const safeCap = Math.max(1, Math.min(MAX_CAP, Math.round(cap) || DEFAULT_CAP));
      setError(null);
      setSubmitting(true);
      try {
        const res = await fetch(SCAN_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: trimmed, cap: safeCap }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          setError(body.error ?? `scan failed (${res.status})`);
          setSubmitting(false);
          return;
        }
        const json = (await res.json()) as { id: string; result?: RunResult };
        // Sync path: stash a gzip+base64'd snapshot of just the RunResult
        // (not the wrapping {id, status, result} envelope — only `result`
        // is consumed downstream). sessionStorage's ~5 MB quota would
        // otherwise overflow on API-heavy docs sites; compression typically
        // drops payloads 6–10× to keep even 50-page scans well under it.
        if (json.result && typeof window !== "undefined") {
          try {
            const encoded = await encodeSnapshot(json.result);
            // Evict prior scans before stashing — each scan keys under a
            // fresh runId and without GC sessionStorage fills up after a
            // few runs and the next setItem throws QuotaExceededError.
            clearOldSnapshots(json.id);
            try {
              window.sessionStorage.setItem(SNAPSHOT_KEY_PREFIX + json.id, encoded);
            } catch {
              // Even after eviction the new snapshot might exceed quota
              // on a fully-loaded scan. Try once more with an empty store.
              clearOldSnapshots();
              window.sessionStorage.setItem(SNAPSHOT_KEY_PREFIX + json.id, encoded);
            }
          } catch {
            setError("Scan completed but the result was too large to cache locally.");
            setSubmitting(false);
            return;
          }
        }
        router.push(`/scan/${encodeURIComponent(json.id)}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "scan failed");
        setSubmitting(false);
      }
    },
    [url, cap, router],
  );

  return (
    <div className="min-h-screen flex flex-col bg-paper">
      <section className="bg-paper-dim/50 border-b border-rule">
        <div className="max-w-[1200px] mx-auto px-6 py-3 flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2.5">
            <span className="inline-block w-2 h-2 rounded-sm bg-accent" />
            <span className="text-[15px] font-bold tracking-tight h-navy">Docs Lens</span>
            <span className="hidden lg:inline text-[11.5px] text-ink/50 ml-1 mono">
              v0.2 · educational
            </span>
          </div>
          <div className="flex items-center gap-2 ml-auto shrink-0">
            <Link href="/why" className="btn-subtle hidden md:inline-flex">
              Why this exists
            </Link>
            <Link href="/methodology" className="btn-subtle hidden sm:inline-flex">
              Methodology
            </Link>
          </div>
        </div>
      </section>

      <main className="flex-1 flex flex-col">
        {/* Hero */}
        <section className="relative px-6 pt-16 pb-12 overflow-hidden">
          <div className="absolute inset-0 -z-10 bg-gradient-to-br from-paper via-paper-tint/30 to-paper" />
          <div className="absolute top-12 right-8 -z-10 hidden lg:block opacity-60" aria-hidden="true">
            <DotGrid />
          </div>
          <div className="max-w-[1100px] mx-auto">
            <div className="inline-flex items-center gap-2 mb-6 chip">
              <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
              <span className="mono text-[10.5px] uppercase tracking-[0.12em]">
                three readers · zero LLMs in scoring
              </span>
            </div>
            <h1 className="h-display h-navy text-[44px] md:text-[68px] leading-[1] mb-6 max-w-4xl">
              See what every agent gets{" "}
              <span className="accent-underline">when it reads your docs.</span>
            </h1>
            <p className="text-[17px] md:text-[18px] text-ink/70 mb-10 max-w-2xl leading-relaxed">
              Raw HTTP fetchers, headless browsers, and search-snippet consumers each
              read your docs in a different way, and every reader is tied to a real,
              named product. Paste a docs URL and we&apos;ll show you the gap, explain
              why it matters, and hand you a prompt to fix it.
            </p>
            <form onSubmit={submit} className="flex flex-col sm:flex-row gap-2 max-w-2xl">
              <input
                type="text"
                inputMode="url"
                placeholder="https://docs.example.com"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="flex-1 input-base"
                disabled={submitting}
              />
              <input
                type="number"
                min={1}
                max={MAX_CAP}
                value={cap}
                onChange={(e) => setCap(Number(e.target.value))}
                className="w-20 input-base"
                disabled={submitting}
                aria-label="page cap"
              />
              <button type="submit" className="btn-accent" disabled={submitting}>
                {submitting ? (SYNC_SCAN ? "Scanning…" : "Starting…") : "Scan →"}
              </button>
            </form>
            {error && (
              <p className="mt-3 text-[12.5px] text-[color:var(--color-fail-ring)]">{error}</p>
            )}
            {submitting && SYNC_SCAN && !error && (
              <p className="mt-3 text-[12.5px] text-ink/55">
                {`Scanning ${cap} ${cap === 1 ? "page" : "pages"}. Typically takes ${estimatedSeconds(cap)} on the hosted demo, since Chromium launches once per page for a clean network stack. Please don’t refresh.`}
              </p>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11.5px] text-ink/50">
              <span>Try:</span>
              {EXAMPLE_URLS.map((ex) => (
                <button
                  key={ex.url}
                  type="button"
                  onClick={() => setUrl(ex.url)}
                  className="text-ink/65 hover:text-accent transition-colors mono underline-offset-2 hover:underline"
                >
                  {ex.label}
                </button>
              ))}
              <span className="ml-auto">
                {DEFAULT_CAP} pages default · max {MAX_CAP} · free, no signup
              </span>
            </div>
          </div>
        </section>

        {/* Demo block */}
        <section className="px-6 pb-20">
          <div className="max-w-[1100px] mx-auto">
            <div className="flex items-baseline gap-3 mb-4 flex-wrap">
              <span className="text-[11px] uppercase tracking-[0.12em] text-ink/50 mono">
                LIVE PREVIEW · sample page
              </span>
              <span className="text-[12.5px] text-ink/55">
                Same content, three very different reads.
              </span>
            </div>
            <HomepageDemo />
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

/** Decorative dot grid for hero background. Static, no random for SSR safety. */
function DotGrid() {
  const cells = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 12; c++) {
      const opacity = ((r * 12 + c) * 41) % 100 < 35 ? 0.18 : 0.06;
      cells.push(
        <span
          key={`${r}-${c}`}
          className="w-1.5 h-1.5 rounded-full bg-accent"
          style={{ opacity }}
        />,
      );
    }
  }
  return <div className="grid grid-cols-12 gap-2">{cells}</div>;
}
