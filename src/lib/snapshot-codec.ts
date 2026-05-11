import type { RunResult } from "@/lib/core/run-types";

export const SNAPSHOT_KEY_PREFIX = "scan-snapshot:";

/**
 * sessionStorage caps at ~5 MB per origin in every major browser. A 10-page
 * scan of an API-heavy docs site (Stripe, GitBook) serializes to 6–12 MB of
 * JSON uncompressed — so the homepage's stash-and-redirect flow fails with
 * a QuotaExceededError before the user reaches the result page.
 *
 * We solve that with native `CompressionStream('gzip')` (Chrome 80+, Safari
 * 16.4+, Firefox 113+ — universal in 2026). JSON of this shape gzips ~6–10×,
 * which keeps even 50-page scans comfortably under the quota. Combined with
 * server-side trimming of the `rawArtifact` field (used only by the checks
 * pipeline; never read by any UI component), the typical payload drops from
 * ~10 MB to under 200 KB.
 */
export async function encodeSnapshot(result: RunResult): Promise<string> {
  const json = JSON.stringify(result);
  const bytes = new TextEncoder().encode(json);
  const cs = new CompressionStream("gzip");
  const writer = cs.writable.getWriter();
  void writer.write(bytes);
  void writer.close();
  const compressed = new Uint8Array(await new Response(cs.readable).arrayBuffer());
  return bytesToBase64(compressed);
}

export async function decodeSnapshot(encoded: string): Promise<RunResult> {
  const compressed = base64ToBytes(encoded);
  const ds = new DecompressionStream("gzip");
  const writer = ds.writable.getWriter();
  void writer.write(compressed);
  void writer.close();
  const json = await new Response(ds.readable).text();
  return JSON.parse(json) as RunResult;
}

// Manual base64 (not btoa) so we can handle the byte stream without going
// through a string intermediary that risks surrogate-pair corruption.
function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const buf = new ArrayBuffer(bin.length);
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/**
 * Each scan stashes under a unique runId-derived key, so without GC the
 * sessionStorage budget fills up over the course of a session and the
 * next setItem throws QuotaExceededError. Drop every prior snapshot
 * before stashing a new one — only the active scan needs to survive
 * (the /scan/[id] route reads its own runId's key, nothing else).
 */
export function clearOldSnapshots(exceptRunId?: string): void {
  if (typeof window === "undefined") return;
  const exceptKey = exceptRunId ? SNAPSHOT_KEY_PREFIX + exceptRunId : null;
  const toRemove: string[] = [];
  for (let i = 0; i < window.sessionStorage.length; i++) {
    const key = window.sessionStorage.key(i);
    if (!key) continue;
    if (key.startsWith(SNAPSHOT_KEY_PREFIX) && key !== exceptKey) {
      toRemove.push(key);
    }
  }
  for (const key of toRemove) window.sessionStorage.removeItem(key);
}
