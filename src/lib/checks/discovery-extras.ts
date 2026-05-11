import { auditedFetch, header } from "../fetch";
import type { AuditEntry, CheckResult } from "../types";

/**
 * Look for an llms.txt directive on the homepage — either a <link rel="llms.txt">
 * tag in the HTML head OR a Link response header pointing at llms.txt. Without
 * a directive, agents that respect the spec only find your llms.txt by guessing
 * the path.
 */
export async function checkLlmsTxtDirective(baseUrl: string): Promise<CheckResult> {
  const audit: AuditEntry[] = [];
  const res = await auditedFetch(baseUrl, audit, {
    note: "probe homepage for llms.txt directive",
  });
  if (!res) {
    return {
      id: "llms-txt-directive",
      category: "discoverability",
      severity: "info",
      title: "Couldn't probe homepage for llms.txt directive",
      message: "Homepage didn't respond.",
      source: "AFDocs v0.3.0 §1.2 (llms-txt-directive)",
      impl: "src/lib/checks/discovery-extras.ts",
      audit,
      conclusion: "Homepage probe inconclusive",
    };
  }

  const linkHeader = header(res.headers, "link") ?? "";
  const headerHasLlms =
    /rel\s*=\s*["']?llms\.txt["']?/i.test(linkHeader) ||
    /rel\s*=\s*["']?llms-txt["']?/i.test(linkHeader);

  // Cheap regex over the raw HTML — fast, doesn't need a parser. Only matches
  // when the rel value literally says llms.txt or llms-txt.
  const tagHasLlms =
    /<link[^>]+rel\s*=\s*["'][^"']*llms[._-]?txt[^"']*["'][^>]*>/i.test(res.body) ||
    /<link[^>]+rel\s*=\s*["'][^"']*llms-txt[^"']*["'][^>]*>/i.test(res.body);

  if (headerHasLlms || tagHasLlms) {
    return {
      id: "llms-txt-directive",
      category: "discoverability",
      severity: "pass",
      title: "Agents are pointed at your llms.txt",
      message: headerHasLlms
        ? "The homepage's Link response header advertises llms.txt. Agents that honour the directive find it on first fetch."
        : "The homepage HTML includes a <link rel=\"llms.txt\"> tag. Agents that honour the directive find it on first fetch.",
      source: "AFDocs v0.3.0 §1.2 (llms-txt-directive)",
      impl: "src/lib/checks/discovery-extras.ts",
      audit,
      conclusion: headerHasLlms
        ? "Link header advertises llms.txt"
        : "<link rel=\"llms.txt\"> tag present on homepage",
    };
  }

  return {
    id: "llms-txt-directive",
    category: "discoverability",
    severity: "fail",
    title: "No llms.txt directive, so agents have to guess where to look",
    message: "Your homepage doesn't include a <link rel=\"llms.txt\"> tag in the HTML head, and the response Link header doesn't advertise llms.txt. Agents either probe /llms.txt as a convention or skip it entirely.",
    fix: 'Add `<link rel="llms.txt" href="/llms.txt">` to your homepage <head>, OR send an HTTP response header `Link: </llms.txt>; rel="llms.txt"`. Either makes the file discoverable on first fetch.',
    source: "AFDocs v0.3.0 §1.2 (llms-txt-directive)",
    impl: "src/lib/checks/discovery-extras.ts",
    audit,
    conclusion: "No llms.txt directive on homepage (Link header or <link> tag)",
  };
}

/**
 * Inventory all Link headers on the homepage. Pass if any Link header is
 * present (even non-AFDocs rels — they signal the site uses RFC 8288 at all).
 * Info otherwise (most sites don't bother).
 */
export async function checkLinkHeaders(baseUrl: string): Promise<CheckResult> {
  const audit: AuditEntry[] = [];
  const res = await auditedFetch(baseUrl, audit, {
    note: "probe homepage Link headers",
  });
  if (!res) {
    return {
      id: "link-headers",
      category: "capability-discovery",
      severity: "info",
      title: "Couldn't probe homepage for Link headers",
      message: "Homepage didn't respond.",
      source: "RFC 8288",
      impl: "src/lib/checks/discovery-extras.ts",
      audit,
      conclusion: "Homepage probe inconclusive",
    };
  }
  const linkHeader = header(res.headers, "link");
  if (linkHeader && linkHeader.length > 0) {
    const rels = (linkHeader.match(/rel\s*=\s*["']?([a-z0-9_-]+)["']?/gi) ?? []).map(
      (m) => m.replace(/.*=\s*["']?/, "").replace(/["']?$/, ""),
    );
    return {
      id: "link-headers",
      category: "capability-discovery",
      severity: "pass",
      title: "Your homepage advertises capabilities via Link headers",
      message: `Homepage returns Link header(s) with ${rels.length} rel(s): ${rels.join(", ") || "—"}. Agents reading Link can discover capabilities without crawling.`,
      source: "RFC 8288",
      impl: "src/lib/checks/discovery-extras.ts",
      audit,
      conclusion: `Link header rels: ${rels.join(", ") || "—"}`,
    };
  }
  return {
    id: "link-headers",
    category: "capability-discovery",
    severity: "info",
    title: "No Link headers on homepage",
    message: "Your homepage response has no Link header. Optional, but Link is the cheapest way to advertise discovery endpoints (api-catalog, service-doc, llms.txt) without a separate fetch.",
    fix: 'Add Link headers in your CDN/server. Example: `Link: </llms.txt>; rel="llms.txt", </.well-known/api-catalog>; rel="api-catalog"`.',
    source: "RFC 8288",
    impl: "src/lib/checks/discovery-extras.ts",
    audit,
    conclusion: "No Link header present",
  };
}
