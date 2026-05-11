import fs from "node:fs/promises";
import path from "node:path";
import { Runner } from "./runner";
import type { RunConfig, RunEvent, RunResult } from "./run-types";

/**
 * In-memory run store with on-disk persistence for completed runs.
 *
 * In memory:
 *   - every event emitted during a run (so an SSE subscriber that
 *     joins late can replay)
 *   - the final RunResult snapshot once done
 *   - the live subscriber set
 *
 * On disk: each completed run is written once to
 * `.docs-lens/runs/<id>.json` so that a server restart doesn't lose the
 * history visible in the homepage's localStorage list. We only persist
 * after the run finishes — partial runs aren't useful for re-loading.
 *
 * Vercel migration replaces this with KV/Redis — the interface
 * (startRun / getRun / subscribe / unsubscribe) stays the same.
 */
interface RunRecord {
  id: string;
  status: "running" | "done" | "error" | "stopped";
  events: RunEvent[];
  result?: RunResult;
  errorMessage?: string;
  /** Set true when a caller asks to stop a running scan. */
  stopRequested: boolean;
  /** Subscribers receiving live events. */
  subscribers: Set<(e: RunEvent) => void>;
}

interface PersistedRun {
  id: string;
  status: "done" | "error" | "stopped";
  result?: RunResult;
  errorMessage?: string;
}

const RUNS_DIR = path.join(process.cwd(), ".docs-lens", "runs");
const runs = new Map<string, RunRecord>();

export function startRun(config: RunConfig): { id: string } {
  const id = newRunId();
  const record: RunRecord = {
    id,
    status: "running",
    events: [],
    stopRequested: false,
    subscribers: new Set(),
  };
  runs.set(id, record);

  // Fire-and-forget. Errors flow into the record + event stream.
  (async () => {
    const runner = new Runner({
      browserMaxContexts: config.browserMaxContexts ?? 4,
    });
    try {
      const result = await runner.scanSite(
        config,
        (e) => emit(record, e),
        () => record.stopRequested,
      );
      record.result = { ...result, id };
      record.status = result.status === "stopped" ? "stopped" : "done";
      void persist(record);
    } catch (err) {
      const message = err instanceof Error ? err.message : "scan failed";
      record.errorMessage = message;
      record.status = "error";
      emit(record, { type: "run:error", message });
      void persist(record);
    } finally {
      // The runner already emitted `run:done` / `run:error` to live
      // subscribers; we just clear the subscriber set here so any late
      // arrivers go through the replay path instead.
      record.subscribers.clear();
      await runner.close();
    }
  })();

  return { id };
}

export function getRun(id: string): RunRecord | undefined {
  return runs.get(id);
}

export async function getRunWithRehydrate(
  id: string,
): Promise<RunRecord | undefined> {
  const inMem = runs.get(id);
  if (inMem) return inMem;
  const persisted = await loadPersisted(id);
  if (!persisted) return undefined;
  // Rehydrate as a finished record. No event log on disk, so SSE replay
  // for re-loaded runs is empty — the snapshot endpoint is the way in.
  const record: RunRecord = {
    id: persisted.id,
    status: persisted.status,
    events: [],
    result: persisted.result,
    errorMessage: persisted.errorMessage,
    stopRequested: false,
    subscribers: new Set(),
  };
  runs.set(id, record);
  return record;
}

export function subscribe(
  id: string,
  onEvent: (e: RunEvent) => void,
): { ok: boolean; replay: RunEvent[]; finished: boolean } {
  const record = runs.get(id);
  if (!record) return { ok: false, replay: [], finished: false };
  if (record.status !== "running") {
    return { ok: true, replay: record.events, finished: true };
  }
  record.subscribers.add(onEvent);
  return { ok: true, replay: record.events, finished: false };
}

export function unsubscribe(id: string, onEvent: (e: RunEvent) => void): void {
  runs.get(id)?.subscribers.delete(onEvent);
}

/**
 * Cooperative stop. The runner polls `stopRequested` between pages and
 * exits its main loop without queuing more work; in-flight pages finish.
 * Returns true if the run existed and was running, false otherwise.
 */
export function requestStop(id: string): boolean {
  const r = runs.get(id);
  if (!r || r.status !== "running") return false;
  r.stopRequested = true;
  return true;
}

function emit(record: RunRecord, e: RunEvent): void {
  record.events.push(e);
  for (const sub of record.subscribers) {
    try {
      sub(e);
    } catch {
      // ignore subscriber errors
    }
  }
}

async function persist(record: RunRecord): Promise<void> {
  if (record.status === "running") return;
  const out: PersistedRun = {
    id: record.id,
    status: record.status,
    result: record.result,
    errorMessage: record.errorMessage,
  };
  try {
    await fs.mkdir(RUNS_DIR, { recursive: true });
    await fs.writeFile(
      path.join(RUNS_DIR, `${record.id}.json`),
      JSON.stringify(out),
      "utf8",
    );
  } catch {
    // Best-effort persistence; failure is logged at most. Don't surface
    // to the user — the in-memory record still works for the live tab.
  }
}

async function loadPersisted(id: string): Promise<PersistedRun | null> {
  // Run ids are constructed from Date.now() + Math.random and contain only
  // [a-z0-9_]; reject anything else as a path-traversal precaution.
  if (!/^run_[a-z0-9_]+$/.test(id)) return null;
  try {
    const raw = await fs.readFile(path.join(RUNS_DIR, `${id}.json`), "utf8");
    return JSON.parse(raw) as PersistedRun;
  } catch {
    return null;
  }
}

function newRunId(): string {
  return `run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
