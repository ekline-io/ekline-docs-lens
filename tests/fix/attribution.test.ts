import { describe, it, expect } from "vitest";
import { attributionFor } from "@/lib/fix/attribution";

describe("attributionFor", () => {
  it("attributes llms.txt findings to rawHttp + snippet", () => {
    expect(attributionFor("llms-txt-exists")).toEqual(["rawHttp", "snippet"]);
    expect(attributionFor("llms-txt-valid")).toEqual(["rawHttp", "snippet"]);
  });

  it("attributes markdown URL support to rawHttp only", () => {
    expect(attributionFor("markdown-url-support")).toEqual(["rawHttp"]);
    expect(attributionFor("content-negotiation")).toEqual(["rawHttp"]);
  });

  it("attributes rendering-strategy to rawHttp + snippet (both read pre-JS HTML)", () => {
    expect(attributionFor("rendering-strategy")).toEqual([
      "rawHttp",
      "snippet",
    ]);
  });

  it("attributes metadata-completeness to snippet only", () => {
    expect(attributionFor("metadata-completeness")).toEqual(["snippet"]);
  });

  it("attributes auth-gate-detection to all three reader populations", () => {
    expect(attributionFor("auth-gate-detection")).toEqual([
      "rawHttp",
      "headless",
      "snippet",
    ]);
  });

  it("returns 'general' for unknown finding ids", () => {
    expect(attributionFor("retext-equality:made-up-rule")).toBe("general");
    expect(attributionFor("vale:Some.Custom.Rule")).toBe("general");
    expect(attributionFor("totally-unknown")).toBe("general");
  });
});
