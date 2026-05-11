import { describe, it, expect } from "vitest";
import {
  PROFILE_IDS,
  isProfileId,
  type ProfileResult,
} from "@/lib/core/types";

describe("core types", () => {
  it("declares all profile ids", () => {
    expect(PROFILE_IDS).toEqual(["rawHttp", "headless", "snippet"]);
  });

  it("isProfileId narrows correctly", () => {
    expect(isProfileId("rawHttp")).toBe(true);
    expect(isProfileId("nope")).toBe(false);
  });

  it("ProfileResult.ok=false carries a reason", () => {
    const r: ProfileResult = {
      id: "snippet",
      ok: false,
      reason: "rate limited",
      bytes: 0,
      chars: 0,
      tokensClaude: 0,
      tokensGpt: 0,
      markdown: "",
      durationMs: 0,
    };
    expect(r.reason).toBe("rate limited");
  });
});
