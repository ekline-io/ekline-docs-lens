import { NextResponse, type NextRequest } from "next/server";
import { startRun } from "@/lib/core/run-store";

export const runtime = "nodejs";
export const maxDuration = 600;

interface ScanBody {
  url?: unknown;
  cap?: unknown;
  pageConcurrency?: unknown;
  browserMaxContexts?: unknown;
}

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
  const rawCap = numberOr(body.cap, 10);
  const cap = Math.max(1, Math.min(50, Math.round(rawCap)));
  const pageConcurrency = numberOr(body.pageConcurrency, 4);
  const browserMaxContexts = numberOr(body.browserMaxContexts, 4);
  const { id } = startRun({ rootUrl: url, cap, pageConcurrency, browserMaxContexts });
  return NextResponse.json({ id }, { status: 202 });
}

function numberOr(x: unknown, fallback: number): number {
  const n = typeof x === "number" ? x : Number(x);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
