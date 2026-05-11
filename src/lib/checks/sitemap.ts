import { auditedFetch, header } from "../fetch";
import type { AuditEntry, CheckResult } from "../types";

const CANDIDATES = [
  "/sitemap.xml",
  "/sitemap_index.xml",
  "/sitemap-index.xml",
  "/sitemap.xml.gz",
];

export async function checkSitemap(baseUrl: string): Promise<CheckResult> {
  const origin = new URL(baseUrl).origin;
  const audit: AuditEntry[] = [];

  let foundPath: string | null = null;
  let foundCt = "";
  let lastStatus = 0;

  for (const path of CANDIDATES) {
    const url = `${origin}${path}`;
    const res = await auditedFetch(url, audit, { note: `probe ${path}` });
    if (!res) continue;
    lastStatus = res.statusCode;
    if (res.statusCode === 200) {
      const ct = header(res.headers, "content-type") ?? "";
      if (ct.includes("xml") || path.endsWith(".gz")) {
        foundPath = path;
        foundCt = ct;
        break;
      }
      // 200 but wrong content-type — soft-404, keep looking
    }
  }

  if (foundPath) {
    return {
      id: "sitemap",
      category: "discoverability",
      severity: "pass",
      title: "Crawlers can find your full page list",
      message: `Sitemap is published at ${foundPath} (${foundCt || "binary"}). Answer engines and search crawlers have a canonical index of every URL.`,
      source: "sitemaps.org",
      impl: "src/lib/checks/sitemap.ts",
      audit,
      conclusion: `Sitemap present at ${foundPath}`,
    };
  }

  return {
    id: "sitemap",
    category: "discoverability",
    severity: "fail",
    title: "No sitemap.xml, so crawlers have to guess your page list",
    message: `Tried ${CANDIDATES.join(", ")}; the last response was HTTP ${lastStatus || "ERR"}. Without a sitemap, answer-engine crawlers fall back to following links from the homepage and may miss pages that aren't navigable.`,
    fix: "Generate /sitemap.xml listing every public docs URL. Most static-site generators (Docusaurus, Mintlify, Nextra) ship with sitemap plugins that handle this automatically.",
    source: "sitemaps.org",
    impl: "src/lib/checks/sitemap.ts",
    audit,
    conclusion: `No sitemap found across ${CANDIDATES.length} candidate paths`,
  };
}
