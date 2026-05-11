import { describe, it, expect, afterAll } from "vitest";
import path from "node:path";
import { headlessProfile } from "@/lib/profiles/headless";
import { BrowserPool } from "@/lib/core/browser-pool";
import { assertProfileShape } from "../core/profile-contract";

const pool = new BrowserPool({ maxContexts: 2, userAgent: "docs-lens-test" });
afterAll(() => pool.close());

const fileUrl =
  "file://" + path.resolve(process.cwd(), "tests/fixtures/spa.html");

describe("headless profile", () => {
  it("captures post-JS DOM content", async () => {
    const r = await headlessProfile.fetch(
      { url: fileUrl, userAgent: "docs-lens-test", timeoutMs: 15_000 },
      { pool }
    );
    assertProfileShape(r, "headless");
    expect(r.ok).toBe(true);
    expect(r.markdown).toContain("SPA Charges");
    expect(r.markdown).toContain("Hydrated content");
  });
});
