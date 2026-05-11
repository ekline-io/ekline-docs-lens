import TurndownService from "turndown";
import { emptyResult } from "@/lib/core/profile";
import type { FetchContext, ProfileId, ProfileResult } from "@/lib/core/types";
import type { BrowserCtx } from "@/lib/core/browser-ctx";
import { countTokens } from "@/lib/tokenizer/count";

export type { BrowserCtx } from "@/lib/core/browser-ctx";

const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  bulletListMarker: "-",
});

async function fetchViaPlaywright(
  ctx: FetchContext,
  deps: BrowserCtx,
): Promise<ProfileResult> {
  const start = Date.now();
  const browserCtx = await deps.pool.acquire();
  let page: Awaited<ReturnType<typeof browserCtx.newPage>> | null = null;
  try {
    page = await browserCtx.newPage();
    // On Vercel's single-process Chromium with 1 GB function memory, image
    // / font / media downloads from a heavy docs site (Stripe ships ~30 MB
    // of imagery per page) push the renderer into OOM and it dies with
    // "Target page, context or browser has been closed". None of those
    // resources affect the HTML we extract for markdown, so block them.
    if (process.env.VERCEL === "1") {
      await page.route("**/*", (route) => {
        const type = route.request().resourceType();
        if (type === "image" || type === "media" || type === "font") {
          return route.abort();
        }
        return route.continue();
      });
    }
    // domcontentloaded fires once the HTML is parsed and async scripts have
    // started — that's the point at which the SSR markup is fully on-page,
    // which is all the markdown-extraction step needs. networkidle waits
    // for "no requests for 500ms", which on analytics-heavy docs sites
    // (Stripe, GitBook, Mintlify) never settles and times out the page.
    const response = await page.goto(ctx.url, {
      waitUntil: "domcontentloaded",
      timeout: ctx.timeoutMs,
    });
    const status = response?.status() ?? 0;
    if (status && (status < 200 || status >= 400)) {
      return emptyResult("headless", `HTTP ${status}`, Date.now() - start);
    }
    // Give client-side hydration a short head start so the captured DOM
    // includes hydrated content from frameworks that defer it past
    // DOMContentLoaded. Capped low so we never burn the function budget.
    await page.waitForLoadState("load", { timeout: 5_000 }).catch(() => {});
    const html = await page.content();
    // Capture a viewport screenshot for the UI fallback when the target site
    // blocks iframe embedding. JPEG q=70 keeps the encoded blob ~40-80 KB
    // per page; data URL inlines it into the run snapshot. We swallow
    // screenshot errors so they never block the main result.
    let screenshot: string | undefined;
    try {
      const buf = await page.screenshot({
        type: "jpeg",
        quality: 70,
        fullPage: false,
      });
      screenshot = `data:image/jpeg;base64,${Buffer.from(buf).toString("base64")}`;
    } catch {
      // best-effort
    }
    const markdown = turndown.turndown(html);
    const { claude, gpt } = countTokens(markdown);
    return {
      id: "headless",
      ok: true,
      bytes: Buffer.byteLength(html, "utf8"),
      chars: markdown.length,
      tokensClaude: claude,
      tokensGpt: gpt,
      markdown,
      rawArtifact: html,
      screenshot,
      durationMs: Date.now() - start,
    };
  } catch (e) {
    return emptyResult(
      "headless",
      summarizeError(e),
      Date.now() - start,
    );
  } finally {
    // Close the page explicitly before releasing the context so any DOM /
    // image-cache memory drops immediately. On Vercel's single-process
    // Chromium this is the difference between the next page reusing a
    // browser that's already 80% of the way to OOM versus one that just
    // freed up most of its allocation.
    if (page) {
      try {
        await page.close();
      } catch {
        // page may already be detached from a dead context — fine.
      }
    }
    await deps.pool.release(browserCtx);
  }
}

// Playwright's catch-all errors often include accumulated Chromium stderr
// (font loader noise on Lambda, CDP transcripts, --enable-logging dumps).
// We don't want that bleeding into the UI's reason text — keep the first
// meaningful line, drop log-formatted noise, cap to 200 chars.
function summarizeError(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e ?? "");
  if (!raw) return "headless fetch failed";
  // Chromium internal logs look like: [MMDD/HHMMSS.uuu:LEVEL:file.cc(N)]
  const lines = raw
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !/^\[\d{4}\/\d{6}\.\d+:[A-Z]+:/.test(l));
  const summary = (lines[0] ?? raw).slice(0, 200);
  return summary || "headless fetch failed";
}

async function doFetch(
  ctx: FetchContext,
  deps: BrowserCtx,
): Promise<ProfileResult> {
  // On Vercel the browser pool launches Chromium via @sparticuz/chromium-min
  // (see browser-pool.ts). The first launch in a fresh function instance
  // pays a 3–5s download+inflate cost; subsequent launches reuse the
  // /tmp-cached binary.
  return fetchViaPlaywright(ctx, deps);
}

export interface HeadlessProfile {
  readonly id: ProfileId;
  fetch: (ctx: FetchContext, deps: BrowserCtx) => Promise<ProfileResult>;
}

export const headlessProfile: HeadlessProfile = {
  id: "headless",
  fetch: doFetch,
};
