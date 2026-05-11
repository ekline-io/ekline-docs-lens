import * as cheerio from "cheerio";
import { headUrl } from "../fetch";
import type { CheckResult } from "../types";

const MAX_LINKS_TO_CHECK = 20;

export async function checkInternalLinks(
  baseUrl: string,
  html: string,
): Promise<CheckResult> {
  const $ = cheerio.load(html);
  $("nav, header, footer").remove();
  const base = new URL(baseUrl);
  const sameHostLinks = new Set<string>();

  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    if (href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;
    try {
      const resolved = new URL(href, baseUrl);
      if (resolved.host === base.host) {
        resolved.hash = "";
        sameHostLinks.add(resolved.toString());
      }
    } catch {
      /* bad href */
    }
  });

  if (sameHostLinks.size === 0) {
    return {
      id: "internal-link-integrity",
      category: "url-stability",
      severity: "info",
      title: "No internal links in the content area to check",
      message: "After excluding navigation, this page has no same-host links. Nothing to verify.",
      source: "docs-lens · link integrity",
      impl: "server/src/checks/internal-links.ts",
    };
  }

  const sample = Array.from(sameHostLinks).slice(0, MAX_LINKS_TO_CHECK);
  const results = await Promise.all(
    sample.map(async (url) => {
      const { statusCode } = await headUrl(url);
      return { url, statusCode };
    }),
  );
  const broken = results.filter((r) => r.statusCode === 0 || r.statusCode >= 400);

  if (broken.length === 0) {
    return {
      id: "internal-link-integrity",
      category: "url-stability",
      severity: "pass",
      title: "Every internal link agents follow from here resolves",
      message:
        sameHostLinks.size > sample.length
          ? `Sampled ${sample.length} of ${sameHostLinks.size} same-host links on this page; all resolve cleanly.`
          : `All ${sample.length} internal links on this page resolve. Agents walking your docs don't hit dead ends.`,
      source: "docs-lens · link integrity",
      impl: "server/src/checks/internal-links.ts",
    };
  }
  const ratio = broken.length / sample.length;
  return {
    id: "internal-link-integrity",
    category: "url-stability",
    severity: ratio > 0.2 ? "fail" : "warn",
    title: "Agents walking your docs hit dead ends",
    message: `${broken.length} of ${sample.length} internal links sampled on this page are broken. Agents following them land on errors, ${broken.slice(0, 3).map((b) => `${new URL(b.url).pathname} (${b.statusCode})`).join(", ")}.`,
    fix: "Audit broken internal links and fix or redirect them. Regenerate llms.txt after the fixes so it reflects the current URL structure.",
    source: "docs-lens · link integrity",
    impl: "server/src/checks/internal-links.ts",
    details: { broken, sampled: sample.length, total: sameHostLinks.size },
  };
}
