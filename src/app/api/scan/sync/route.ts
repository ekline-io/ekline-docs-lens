import { NextResponse, type NextRequest } from "next/server";
import { Runner } from "@/lib/core/runner";
import type { RunResult } from "@/lib/core/run-types";
import type { ProfileId, ProfileResult } from "@/lib/core/types";

export const runtime = "nodejs";
export const maxDuration = 600;

interface ScanBody {
  url?: unknown;
  cap?: unknown;
  pageConcurrency?: unknown;
  browserMaxContexts?: unknown;
}

/**
 * Synchronous scan endpoint for serverless hosts (Vercel) where the live
 * SSE/polling architecture in /api/scan can't span function invocations.
 * Runs the entire scan inside one request and returns the full RunResult
 * inline. The client stores the snapshot in sessionStorage and hydrates
 * /scan/[id] from there, bypassing the in-memory run-store entirely.
 *
 * Trade: no live progress, just a single long await. Within the 600s
 * function budget that's fine for caps up to ~50 pages on a fast site.
 */
export async function POST(req: NextRequest) {
  let body: ScanBody;
  try {
    body = (await req.json()) as ScanBody;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const url = typeof body.url === "string" ? body.url : "";
  if (!url) {
    return NextResponse.json({ error: "missing url" }, { status: 400 });
  }
  try {
    new URL(url);
  } catch {
    return NextResponse.json({ error: "invalid url" }, { status: 400 });
  }
  // On Vercel, cap pages at 5. Each page costs ~15-25s (per-page Chromium
  // recycle + render); Vercel's edge proxy severs the client connection at
  // ~5 min regardless of the function-duration budget, so 5 pages × 25s
  // = 125s is the safe ceiling. Local dev keeps the 50-page ceiling.
  const requestedCap = numberOr(body.cap, 5);
  const cap = process.env.VERCEL === "1"
    ? clamp(requestedCap, 1, 5)
    : clamp(requestedCap, 1, 50);
  // Serialize browser work on Vercel: sparticuz/chromium runs Chromium in
  // --single-process mode (no Lambda IPC), so multiple concurrent contexts
  // share one renderer's memory pool. On 1 GB Vercel functions, a heavy
  // page (Stripe, GitBook) plus 3 in-flight ones reliably OOMs the
  // renderer with a SIGTRAP-style "Target page, context or browser has
  // been closed". One context at a time keeps the renderer alive.
  const isVercel = process.env.VERCEL === "1";
  const pageConcurrency = numberOr(body.pageConcurrency, isVercel ? 1 : 4);
  const browserMaxContexts = numberOr(body.browserMaxContexts, isVercel ? 1 : 4);

  const runner = new Runner({ browserMaxContexts });
  try {
    const result = await runner.scanSite({
      rootUrl: url,
      cap,
      pageConcurrency,
      browserMaxContexts,
    });
    return NextResponse.json({
      id: result.id,
      status: result.status,
      result: stripServerOnlyFields(result),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "scan failed";
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    await runner.close();
  }
}

// rawArtifact (raw HTML / serialized snippet) is consumed only by the
// server-side checks pipeline. It can be 100–300 KB per profile per page,
// so a 10-page scan ships 3–9 MB of dead weight to the client otherwise.
// Strip it before returning the inline result.
function stripServerOnlyFields(result: RunResult): RunResult {
  return {
    ...result,
    pages: result.pages.map((p) => {
      const profiles: Record<string, ProfileResult> = {};
      for (const [id, profile] of Object.entries(p.profiles)) {
        profiles[id] = withoutRawArtifact(profile);
      }
      return { ...p, profiles: profiles as Record<ProfileId, ProfileResult> };
    }),
  };
}

function withoutRawArtifact(p: ProfileResult): ProfileResult {
  const out = { ...p };
  delete out.rawArtifact;
  return out;
}

function numberOr(x: unknown, fallback: number): number {
  const n = typeof x === "number" ? x : Number(x);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(n)));
}
