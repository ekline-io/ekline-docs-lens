import { request } from "undici";
import { XMLParser } from "fast-xml-parser";

export interface ParsedSitemap {
  isIndex: boolean;
  urls: string[];
}

const parser = new XMLParser({
  ignoreAttributes: true,
  trimValues: true,
});

/**
 * Parse a single sitemap XML body. Recognizes both flat <urlset> and
 * <sitemapindex> shapes per https://www.sitemaps.org/protocol.html. On
 * malformed input returns an empty list rather than throwing — sitemaps in
 * the wild are messy, and a partial scan is better than a crash.
 */
export function parseSitemapXml(xml: string): ParsedSitemap {
  let parsed: unknown;
  try {
    parsed = parser.parse(xml);
  } catch {
    return { isIndex: false, urls: [] };
  }
  if (!parsed || typeof parsed !== "object") {
    return { isIndex: false, urls: [] };
  }
  const root = parsed as Record<string, unknown>;
  if (root.sitemapindex) {
    const urls = collectLocs(
      (root.sitemapindex as Record<string, unknown>).sitemap,
    );
    return { isIndex: true, urls };
  }
  if (root.urlset) {
    const urls = collectLocs((root.urlset as Record<string, unknown>).url);
    return { isIndex: false, urls };
  }
  return { isIndex: false, urls: [] };
}

function collectLocs(input: unknown): string[] {
  if (!input) return [];
  const arr = Array.isArray(input) ? input : [input];
  const out: string[] = [];
  for (const item of arr) {
    if (item && typeof item === "object" && "loc" in item) {
      const loc = (item as Record<string, unknown>).loc;
      if (typeof loc === "string" && loc.trim()) out.push(loc.trim());
    }
  }
  return out;
}

/**
 * Fetch a sitemap URL and recursively expand sitemap-index entries one level
 * deep (most real-world indexes are flat or single-nested). Returns a flat
 * deduplicated list of page URLs.
 */
export async function fetchSitemap(url: string): Promise<string[]> {
  const xml = await fetchXml(url);
  if (!xml) return [];
  const parsed = parseSitemapXml(xml);
  if (!parsed.isIndex) return dedupe(parsed.urls);
  const childResults = await Promise.all(
    parsed.urls.map(async (childUrl) => {
      const childXml = await fetchXml(childUrl);
      if (!childXml) return [];
      const childParsed = parseSitemapXml(childXml);
      // We do not recurse a third level; in practice that's vanishingly rare
      // and the cost of unbounded recursion outweighs the catch.
      return childParsed.isIndex ? [] : childParsed.urls;
    }),
  );
  return dedupe(childResults.flat());
}

async function fetchXml(url: string): Promise<string | null> {
  try {
    const res = await request(url, {
      method: "GET",
      headers: { accept: "application/xml,text/xml;q=0.9" },
    });
    if (res.statusCode < 200 || res.statusCode >= 400) {
      await res.body.dump();
      return null;
    }
    return await res.body.text();
  } catch {
    return null;
  }
}

function dedupe(urls: string[]): string[] {
  return Array.from(new Set(urls));
}
