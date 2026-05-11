import { describe, it, expect } from "vitest";
import { generateAgentFixPrompt } from "@/lib/fix/prompt";
import type { FixFinding } from "@/lib/fix/types";

const baseFinding = (overrides: Partial<FixFinding>): FixFinding => ({
  id: "llms-txt-exists",
  title: "llms.txt missing",
  severity: "fail",
  source: "check",
  evidence: "/llms.txt returned 404",
  affectedProfiles: ["rawHttp", "snippet"],
  fixHint: "create /llms.txt",
  pageUrl: "https://docs.example.com/",
  occurrences: 1,
  ...overrides,
});

describe("generateAgentFixPrompt", () => {
  it("includes URL, score, grade, failing+warning counts in header", () => {
    const out = generateAgentFixPrompt({
      siteUrl: "https://docs.example.com",
      siteName: "Example",
      score: 87,
      grade: "B",
      findings: [baseFinding({})],
    });
    expect(out).toContain("# Agent Score Fix Report — Example");
    expect(out).toContain("URL: https://docs.example.com");
    expect(out).toContain("Score: 87/100 (Grade B)");
    expect(out).toContain("1 failing checks and 0 warnings");
  });

  it("groups failures and warnings into separate sections", () => {
    const out = generateAgentFixPrompt({
      siteUrl: "https://x.com",
      siteName: "X",
      score: 70,
      grade: "C",
      findings: [
        baseFinding({ id: "llms-txt-exists", severity: "fail", title: "no llms.txt" }),
        baseFinding({ id: "metadata-completeness", severity: "warn", title: "missing meta" }),
      ],
    });
    expect(out).toContain("## Failing Checks (1)");
    expect(out).toContain("## Warnings (1)");
    expect(out.indexOf("## Failing Checks")).toBeLessThan(out.indexOf("## Warnings"));
  });

  it("includes a Common fixes block sourced from check-fix-copy", () => {
    const out = generateAgentFixPrompt({
      siteUrl: "https://x.com",
      siteName: "X",
      score: 50,
      grade: "F",
      findings: [
        baseFinding({ id: "llms-txt-exists", severity: "fail" }),
        baseFinding({ id: "content-negotiation", severity: "fail", title: "no markdown" }),
      ],
    });
    expect(out).toContain("### Common fixes:");
    expect(out).toContain("**No llms.txt**");
    expect(out).toContain("**No content negotiation**");
  });

  it("includes the npx afdocs pointer at the end", () => {
    const out = generateAgentFixPrompt({
      siteUrl: "https://x.com",
      siteName: "X",
      score: 100,
      grade: "A+",
      findings: [],
    });
    expect(out).toContain("npx afdocs check https://x.com --fixes --verbose");
  });

  it("dedupes findings by id when generating common fixes", () => {
    const out = generateAgentFixPrompt({
      siteUrl: "https://x.com",
      siteName: "X",
      score: 60,
      grade: "F",
      findings: [
        baseFinding({ id: "llms-txt-exists", pageUrl: "https://x.com/a" }),
        baseFinding({ id: "llms-txt-exists", pageUrl: "https://x.com/b" }),
      ],
    });
    // The dedupe property: `llms-txt-exists` appears once in failing-checks
    // (after dedupe) and once in common-fixes — not twice in either. Concretely
    // count the bullets rather than substring matches, because evidence/title
    // text varies and isn't what dedupe is about.
    const failBullets = out
      .split("\n")
      .filter((l) => l.startsWith("- [llms-txt-exists]"));
    expect(failBullets.length).toBe(1);
    const commonFixBullets = out
      .split("\n")
      .filter((l) => l.startsWith("- **No llms.txt**"));
    expect(commonFixBullets.length).toBe(1);
  });
});
