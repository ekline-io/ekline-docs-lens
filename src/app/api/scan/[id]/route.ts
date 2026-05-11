import { NextResponse } from "next/server";
import { getRunWithRehydrate, requestStop } from "@/lib/core/run-store";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const record = await getRunWithRehydrate(id);
  if (!record) {
    return NextResponse.json({ error: "unknown run" }, { status: 404 });
  }
  return NextResponse.json({
    id,
    status: record.status,
    result: record.result ?? null,
    errorMessage: record.errorMessage ?? null,
  });
}

/**
 * Cooperative stop. We set a flag on the run record; the runner picks it up
 * between pages and exits its loop. In-flight pages finish gracefully so
 * partial results stay coherent. Returns 202 (accepted) on a running scan,
 * 409 (conflict) when there's nothing to stop.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const ok = requestStop(id);
  if (!ok) {
    return NextResponse.json(
      { error: "run not found or not running" },
      { status: 409 },
    );
  }
  return NextResponse.json({ ok: true, stopping: true }, { status: 202 });
}
