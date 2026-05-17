import { auditedFetch, header } from "../fetch";
import type { AuditEntry, CheckResult } from "../types";

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
