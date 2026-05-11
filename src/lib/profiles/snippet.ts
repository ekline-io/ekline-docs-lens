import { request } from "undici";
import * as cheerio from "cheerio";
import { emptyResult, type Profile } from "@/lib/core/profile";
import type { FetchContext, ProfileResult } from "@/lib/core/types";
import { countTokens } from "@/lib/tokenizer/count";

const PREVIEW_CHARS = 200;

interface Snippet {
  title: string | null;
  description: string | null;
  og: Record<string, string>;
  twitter: Record<string, string>;
  firstH1: string | null;
  preview: string;
  jsonLd: unknown[];
}

function extract(html: string): Snippet {
  const $ = cheerio.load(html);
  const title = $("title").first().text().trim() || null;
  const description = $('meta[name="description"]').attr("content")?.trim() ?? null;
  const og: Record<string, string> = {};
  $('meta[property^="og:"]').each((_, el) => {
    const k = $(el).attr("property");
    const v = $(el).attr("content");
    if (k && v) og[k] = v;
  });
  const twitter: Record<string, string> = {};
  $('meta[name^="twitter:"]').each((_, el) => {
    const k = $(el).attr("name");
    const v = $(el).attr("content");
    if (k && v) twitter[k] = v;
  });
  const firstH1 = $("h1").first().text().trim() || null;
  // First ~200 chars of visible body text. Strip script/style first so we
  // don't pull JS into the "preview".
  $("script,style,noscript,template").remove();
  const bodyText = $("body").text().replace(/\s+/g, " ").trim();
  const preview = bodyText.slice(0, PREVIEW_CHARS);
  const jsonLd: unknown[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).contents().text();
    try {
      jsonLd.push(JSON.parse(raw));
    } catch {
      // malformed JSON-LD ignored — surfaces as a future check finding
    }
  });
  return { title, description, og, twitter, firstH1, preview, jsonLd };
}

function toMarkdown(s: Snippet): string {
  const lines: string[] = [];
  if (s.title) lines.push(`Title: ${s.title}`);
  if (s.description) lines.push(`Description: ${s.description}`);
  for (const [k, v] of Object.entries(s.og)) lines.push(`${k}: ${v}`);
  for (const [k, v] of Object.entries(s.twitter)) lines.push(`${k}: ${v}`);
  if (s.firstH1) lines.push(`First H1: ${s.firstH1}`);
  if (s.jsonLd.length) {
    lines.push("");
    lines.push("JSON-LD:");
    for (const item of s.jsonLd) {
      lines.push(JSON.stringify(item));
    }
  }
  lines.push("");
  lines.push(`Preview (${s.preview.length} chars):`);
  lines.push(s.preview);
  return lines.join("\n");
}

async function doFetch(ctx: FetchContext): Promise<ProfileResult> {
  const start = Date.now();
  try {
    const res = await request(ctx.url, {
      method: "GET",
      headers: {
        "user-agent": ctx.userAgent,
        accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
      },
      bodyTimeout: ctx.timeoutMs,
      headersTimeout: ctx.timeoutMs,
      signal: ctx.signal,
    } as Parameters<typeof request>[1]);
    const body = await res.body.text();
    const ok = res.statusCode >= 200 && res.statusCode < 400;
    if (!ok) {
      return emptyResult("snippet", `HTTP ${res.statusCode}`, Date.now() - start);
    }
    const snippet = extract(body);
    const markdown = toMarkdown(snippet);
    const { claude, gpt } = countTokens(markdown);
    return {
      id: "snippet",
      ok: true,
      bytes: Buffer.byteLength(markdown, "utf8"),
      chars: markdown.length,
      tokensClaude: claude,
      tokensGpt: gpt,
      markdown,
      rawArtifact: JSON.stringify(snippet),
      durationMs: Date.now() - start,
    };
  } catch (e) {
    return emptyResult(
      "snippet",
      e instanceof Error ? e.message : "fetch failed",
      Date.now() - start
    );
  }
}

export const snippetProfile: Profile = { id: "snippet", fetch: doFetch };
