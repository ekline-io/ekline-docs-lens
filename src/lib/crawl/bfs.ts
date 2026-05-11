import { request } from "undici";
import * as cheerio from "cheerio";

export interface BfsOptions {
  maxPages: number;
  /** Max BFS depth from the seed. Defaults to 6, generous for typical docs. */
  maxDepth?: number;
  userAgent?: string;
  timeoutMs?: number;
}

/**
 * BFS crawl from a seed URL, following internal `<a href>` links. Scope is
 * (a) same host as seed, (b) URL pathname starts with the seed's pathname.
 * Stops when the queue empties, when maxPages is hit, or when maxDepth is
 * exceeded.
 */
export async function bfsCrawl(seed: string, opts: BfsOptions): Promise<string[]> {
  const seedUrl = new URL(seed);
  const seedPrefix = seedUrl.pathname.replace(/\/+$/, "");
  const maxDepth = opts.maxDepth ?? 6;
  const userAgent = opts.userAgent ?? "docs-lens/0.2";
  const timeoutMs = opts.timeoutMs ?? 15_000;

  const visited = new Set<string>();
  const queue: { url: string; depth: number }[] = [{ url: normalize(seed), depth: 0 }];
  const order: string[] = [];

  while (queue.length && order.length < opts.maxPages) {
    const { url, depth } = queue.shift()!;
    if (visited.has(url)) continue;
    visited.add(url);
    order.push(url);
    if (depth >= maxDepth) continue;

    const html = await fetchHtml(url, userAgent, timeoutMs);
    if (!html) continue;
    const links = extractLinks(html, url);
    for (const link of links) {
      if (visited.has(link)) continue;
      const lu = new URL(link);
      if (lu.host !== seedUrl.host) continue;
      const lp = lu.pathname.replace(/\/+$/, "");
      if (!lp.startsWith(seedPrefix)) continue;
      queue.push({ url: link, depth: depth + 1 });
    }
  }
  return order;
}

function normalize(u: string): string {
  const url = new URL(u);
  url.hash = "";
  // Strip trailing slash so "/api" and "/api/" dedupe.
  url.pathname = url.pathname.replace(/\/+$/, "") || "/";
  return url.toString();
}

function extractLinks(html: string, base: string): string[] {
  const $ = cheerio.load(html);
  const out: string[] = [];
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    if (href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("javascript:")) return;
    try {
      out.push(normalize(new URL(href, base).toString()));
    } catch {
      // ignore unparseable hrefs
    }
  });
  return out;
}

async function fetchHtml(url: string, userAgent: string, timeoutMs: number): Promise<string | null> {
  try {
    const res = await request(url, {
      method: "GET",
      headers: {
        "user-agent": userAgent,
        accept: "text/html,application/xhtml+xml;q=0.9",
      },
      bodyTimeout: timeoutMs,
      headersTimeout: timeoutMs,
    } as Parameters<typeof request>[1]);
    if (res.statusCode < 200 || res.statusCode >= 400) {
      await res.body.dump();
      return null;
    }
    return await res.body.text();
  } catch {
    return null;
  }
}
