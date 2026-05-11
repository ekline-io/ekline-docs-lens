import { describe, it, expect } from "vitest";
import { fixCopyFor, allFixCopyKeys } from "@/lib/fix/check-fix-copy";

describe("check-fix-copy", () => {
  it("returns concrete fix copy for known check ids", () => {
    const llms = fixCopyFor("llms-txt-exists");
    expect(llms).toBeTruthy();
    expect(llms?.short).toContain("llms.txt");
    expect(llms?.long).toContain("llmstxt.org");
  });

  it("returns null for unknown check ids", () => {
    expect(fixCopyFor("nonexistent-check-id")).toBeNull();
  });

  it("covers every check id in the AXIS_OF map", async () => {
    const { AXIS_OF } = await import("@/lib/types");
    const missing = Object.keys(AXIS_OF)
      .filter((k) => !k.startsWith("prose-"))
      .filter((k) => !fixCopyFor(k));
    expect(missing, `missing fix copy for: ${missing.join(", ")}`).toEqual([]);
  });

  it("exposes its key list", () => {
    const keys = allFixCopyKeys();
    expect(keys.length).toBeGreaterThan(10);
    expect(keys).toContain("llms-txt-exists");
  });
});
