import { auditedFetch, header } from "../fetch";
import type { AuditEntry, CheckResult } from "../types";

export async function checkCacheHeaders(baseUrl: string): Promise<CheckResult> {
  const audit: AuditEntry[] = [];
  const res = await auditedFetch(baseUrl, audit, {
    note: "probe homepage for cache headers",
  });

  if (!res) {
    return {
      id: "cache-headers",
      category: "observability",
      severity: "info",
      title: "Couldn't probe homepage for cache headers",
      message: "Homepage didn't respond.",
      source: "RFC 9111 (HTTP caching)",
      impl: "src/lib/checks/cache-headers.ts",
      audit,
      conclusion: "Homepage probe inconclusive",
    };
  }

  const lastMod = header(res.headers, "last-modified");
  const etag = header(res.headers, "etag");

  if (lastMod || etag) {
    return {
      id: "cache-headers",
      category: "observability",
      severity: "pass",
      title: "Agents can re-use cached fetches of your docs",
      message: `Homepage returns ${[lastMod && "Last-Modified", etag && "ETag"].filter(Boolean).join(" + ")}. Agents that respect HTTP caching skip the body when nothing changed, saving bandwidth and budget.`,
      source: "RFC 9111 (HTTP caching)",
      impl: "src/lib/checks/cache-headers.ts",
      audit,
      conclusion: `Cache validators present: ${[lastMod && "Last-Modified", etag && "ETag"].filter(Boolean).join(", ")}`,
    };
  }

  return {
    id: "cache-headers",
    category: "observability",
    severity: "warn",
    title: "No cache validators on docs responses",
    message: "Homepage returns neither Last-Modified nor ETag. Agents have to refetch the full body every time even if nothing changed.",
    fix: "Configure your origin or CDN to send Last-Modified (timestamp of the last source change) or ETag (hash of the response body). Most static-site generators emit these by default; check your CDN settings if they're missing.",
    source: "RFC 9111 (HTTP caching)",
    impl: "src/lib/checks/cache-headers.ts",
    audit,
    conclusion: "Neither Last-Modified nor ETag present on homepage",
  };
}
