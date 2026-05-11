import { describe, it, expect } from "vitest";
import { diffRuns } from "@/lib/diff/run-diff";
import type { RunResult } from "@/lib/core/run-types";
import type { FixFinding } from "@/lib/fix/types";

function f(over: Partial<FixFinding>): FixFinding {
  return {
    id: "x",
    title: "t",
    severity: "warn",
    source: "check",
    evidence: "",
    affectedProfiles: "general",
    fixHint: "",
    pageUrl: "https://x",
    occurrences: 1,
    ...over,
  };
}

function run(id: string, finishedAt: number, urls: string[], fixes: FixFinding[]): RunResult {
  return {
    id,
    config: { rootUrl: "https://x", cap: 250 },
    status: "done",
    startedAt: finishedAt - 1000,
    finishedAt,
    pages: urls.map((u) => ({
      url: u,
      profiles: {} as never,
      summary: {} as never,
    })),
    siteStats: {
      pagesScanned: urls.length,
      source: "sitemap",
      capped: false,
      avgJsGatedFraction: 0.4,
      avgTokensClaudePerProfile: {} as never,
      fixBacklog: fixes.filter((x) => x.severity !== "info").length,
    },
    fixes,
  };
}

describe("diffRuns", () => {
  it("identifies new and resolved findings between two runs", () => {
    const before = run("r1", 1000, ["https://x/a", "https://x/b"], [
      f({ id: "kept", occurrences: 5 }),
      f({ id: "resolved", occurrences: 3 }),
    ]);
    const after = run("r2", 2000, ["https://x/a", "https://x/b"], [
      f({ id: "kept", occurrences: 5 }),
      f({ id: "new" }),
    ]);
    const d = diffRuns(before, after);
    expect(d.newFindings.map((x) => x.id)).toEqual(["new"]);
    expect(d.resolvedFindings.map((x) => x.id)).toEqual(["resolved"]);
    expect(d.changedFindings).toHaveLength(0);
  });

  it("flags occurrence-count changes for findings present in both", () => {
    const before = run("r1", 1000, ["x"], [f({ id: "shared", occurrences: 10 })]);
    const after = run("r2", 2000, ["x"], [f({ id: "shared", occurrences: 4 })]);
    const d = diffRuns(before, after);
    expect(d.changedFindings).toHaveLength(1);
    expect(d.changedFindings[0].delta).toBe(-6);
  });

  it("computes page diffs", () => {
    const before = run("r1", 1000, ["https://x/a", "https://x/b"], []);
    const after = run("r2", 2000, ["https://x/b", "https://x/c"], []);
    const d = diffRuns(before, after);
    expect(d.newPages).toEqual(["https://x/c"]);
    expect(d.removedPages).toEqual(["https://x/a"]);
    expect(d.commonPages).toBe(1);
  });

  it("normalizes order so 'before' is always the older run", () => {
    const r1 = run("r1", 1000, [], []);
    const r2 = run("r2", 2000, [], []);
    const d = diffRuns(r2, r1);
    expect(d.before.id).toBe("r1");
    expect(d.after.id).toBe("r2");
  });

  it("computes site-stats delta when both runs have stats", () => {
    const before = run("r1", 1000, ["x"], []);
    const after = run("r2", 2000, ["x", "y"], []);
    if (after.siteStats) after.siteStats.fixBacklog = 5;
    const d = diffRuns(before, after);
    expect(d.siteStats).not.toBeNull();
    expect(d.siteStats!.pagesScanned.delta).toBe(1);
    expect(d.siteStats!.fixBacklog.delta).toBe(5);
  });
});
