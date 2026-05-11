import { fetchSitemap } from "./sitemap";
import { bfsCrawl } from "./bfs";

export interface DiscoverOptions {
  /** Hard cap on page count returned. Default 10. */
  cap?: number;
  userAgent?: string;
  timeoutMs?: number;
}

export interface DiscoverResult {
  pages: string[];
  source: "sitemap" | "bfs";
  capped: boolean;
}

const DEFAULT_CAP = 10;

/**
 * Discover the page list for a docs scan starting from a single seed URL.
 *
 * Strategy:
 *   1. Try `<host>/sitemap.xml`. If we get URLs, filter to ones under the
 *      seed's path prefix (so pointing at /docs/api/ doesn't pull in the
 *      whole marketing site). Use sitemap result.
 *   2. Otherwise, run subpath-scoped BFS from the seed.
 *   3. Cap the result at `cap` pages (default 10). Set `capped` if we hit
 *      the limit.
 */
export async function discoverPages(
  seed: string,
  opts: DiscoverOptions = {},
): Promise<DiscoverResult> {
  const cap = opts.cap ?? DEFAULT_CAP;
  const seedUrl = new URL(seed);
  const seedPrefix = seedUrl.pathname.replace(/\/+$/, "") || "/";
  const sitemapUrl = `${seedUrl.protocol}//${seedUrl.host}/sitemap.xml`;

  const sitemapUrls = await fetchSitemap(sitemapUrl);
  if (sitemapUrls.length) {
    const filtered = sitemapUrls.filter((u) => underPrefix(u, seedUrl.host, seedPrefix));
    if (filtered.length) {
      return capResult(filtered, cap, "sitemap");
    }
  }

  const bfs = await bfsCrawl(seed, {
    maxPages: cap,
    userAgent: opts.userAgent,
    timeoutMs: opts.timeoutMs,
  });
  return capResult(bfs, cap, "bfs");
}

function underPrefix(u: string, host: string, prefix: string): boolean {
  try {
    const url = new URL(u);
    if (url.host !== host) return false;
    const p = url.pathname.replace(/\/+$/, "") || "/";
    return p === prefix || p.startsWith(prefix === "/" ? "/" : `${prefix}/`);
  } catch {
    return false;
  }
}

function capResult(urls: string[], cap: number, source: "sitemap" | "bfs"): DiscoverResult {
  if (urls.length <= cap) {
    return { pages: urls, source, capped: false };
  }
  return { pages: urls.slice(0, cap), source, capped: true };
}
