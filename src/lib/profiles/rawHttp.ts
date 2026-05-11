import { request } from "undici";
import { htmlToMarkdown } from "@/lib/convert";
import { emptyResult, type Profile } from "@/lib/core/profile";
import type { FetchContext, ProfileResult } from "@/lib/core/types";
import { countTokens } from "@/lib/tokenizer/count";

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
    const markdown = htmlToMarkdown(body);
    const { claude, gpt } = countTokens(markdown);
    return {
      id: "rawHttp",
      ok: res.statusCode >= 200 && res.statusCode < 400,
      reason: res.statusCode >= 400 ? `HTTP ${res.statusCode}` : undefined,
      bytes: Buffer.byteLength(body, "utf8"),
      chars: markdown.length,
      tokensClaude: claude,
      tokensGpt: gpt,
      markdown,
      rawArtifact: body,
      durationMs: Date.now() - start,
    };
  } catch (e) {
    return emptyResult(
      "rawHttp",
      e instanceof Error ? e.message : "fetch failed",
      Date.now() - start
    );
  }
}

export const rawHttpProfile: Profile = { id: "rawHttp", fetch: doFetch };
