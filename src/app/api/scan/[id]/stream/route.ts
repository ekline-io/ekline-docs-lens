import {
  getRunWithRehydrate,
  subscribe,
  unsubscribe,
} from "@/lib/core/run-store";
import type { RunEvent } from "@/lib/core/run-types";

export const runtime = "nodejs";
export const maxDuration = 600;

/**
 * Server-Sent Events stream for a single run. On connect we replay every
 * event accumulated so far (so a refreshed browser tab catches up), then
 * stream future events live until the run finishes.
 *
 * SSE wire format: `data: <JSON>\n\n` per event. The terminal `run:done`
 * or `run:error` event signals end-of-stream and we close the controller.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const encoder = new TextEncoder();
  // Load curated examples (example_*) and disk-persisted runs into the
  // in-memory map so subscribe() can find them. A no-op for live runs.
  await getRunWithRehydrate(id);

  const stream = new ReadableStream({
    start(controller) {
      const send = (e: RunEvent) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
        } catch {
          // controller closed before we could write
        }
        if (
          e.type === "run:done" ||
          e.type === "run:error" ||
          e.type === "run:stopped"
        ) {
          unsubscribe(id, listener);
          try {
            controller.close();
          } catch {
            // already closed
          }
        }
      };

      const listener = (e: RunEvent) => send(e);

      const sub = subscribe(id, listener);
      if (!sub.ok) {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "run:error", message: "unknown run" })}\n\n`,
          ),
        );
        controller.close();
        return;
      }

      // Replay accumulated events first so a late client catches up.
      for (const e of sub.replay) send(e);

      if (sub.finished) {
        // The "finished" replay path: subscribe() did not register us as a
        // live listener, so we need to close after replaying.
        try {
          controller.close();
        } catch {
          // already closed
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
