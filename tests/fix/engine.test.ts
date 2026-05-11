import { describe, it, expect } from "vitest";
import { mergeAndRank } from "@/lib/fix/engine";
import type { FixFinding } from "@/lib/fix/types";

function f(over: Partial<FixFinding>): FixFinding {
  return {
    id: "x:y",
    title: "t",
    severity: "warn",
    source: "check",
    evidence: "",
    affectedProfiles: "general",
    fixHint: "",
    pageUrl: "https://x/1",
    occurrences: 1,
    ...over,
  };
}

describe("mergeAndRank", () => {
  it("dedupes identical findings across pages and bumps occurrences", () => {
    const findings = [
      f({ id: "check:llms-txt-exists", pageUrl: "https://x/1" }),
      f({ id: "check:llms-txt-exists", pageUrl: "https://x/2" }),
      f({ id: "check:llms-txt-exists", pageUrl: "https://x/3" }),
    ];
    const out = mergeAndRank(findings);
    expect(out).toHaveLength(1);
    expect(out[0].occurrences).toBe(3);
    expect(out[0].pageUrl).toBe("https://x/1"); // first-seen page wins
  });

  it("applies attribution to known finding ids", () => {
    const out = mergeAndRank([
      f({ id: "llms-txt-exists", source: "check" }),
    ]);
    expect(out[0].affectedProfiles).toEqual(["rawHttp", "snippet"]);
  });

  it("ranks fail above warn above info", () => {
    const out = mergeAndRank([
      f({ id: "a", severity: "info" }),
      f({ id: "b", severity: "fail" }),
      f({ id: "c", severity: "warn" }),
    ]);
    expect(out.map((x) => x.severity)).toEqual(["fail", "warn", "info"]);
  });

  it("breaks severity ties by occurrences (more first)", () => {
    const out = mergeAndRank([
      f({ id: "a", severity: "warn", pageUrl: "https://x/1" }),
      f({ id: "a", severity: "warn", pageUrl: "https://x/2" }),
      f({ id: "b", severity: "warn", pageUrl: "https://x/1" }),
    ]);
    expect(out[0].id).toBe("a");
    expect(out[0].occurrences).toBe(2);
    expect(out[1].id).toBe("b");
  });

  it("breaks remaining ties by source priority (check > diff)", () => {
    const out = mergeAndRank([
      f({ id: "x:diff", source: "diff", severity: "warn" }),
      f({ id: "x:check", source: "check", severity: "warn" }),
    ]);
    expect(out.map((x) => x.source)).toEqual(["check", "diff"]);
  });
});
