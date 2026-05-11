import {
  chromium,
  type Browser,
  type BrowserContext,
  type LaunchOptions,
} from "playwright";

// Pinned to match Playwright 1.59.1's bundled Chromium (147.0.7727.15). When
// these drift, `chromium.launch({executablePath})` can silently hang because
// Playwright's CDP handshake doesn't match the binary's protocol version.
// Bump both in lockstep with @sparticuz/chromium-min in package.json.
const SPARTICUZ_CHROMIUM_VERSION = "147.0.2";
const SPARTICUZ_TAR_URL = `https://github.com/Sparticuz/chromium/releases/download/v${SPARTICUZ_CHROMIUM_VERSION}/chromium-v${SPARTICUZ_CHROMIUM_VERSION}-pack.x64.tar`;

// Wall-clock budget for chromium.launch. The first launch in a fresh function
// instance pays download + inflate + spawn (~10-15s). Warm relaunches only
// pay spawn (~2-5s). 30s is enough headroom for both without wasting budget
// when a launch genuinely won't recover.
const LAUNCH_TIMEOUT_MS = 30_000;

export interface BrowserPoolOptions {
  maxContexts: number;
  userAgent?: string;
  /**
   * When true, release() also closes the underlying browser process so the
   * next acquire() launches from scratch. Used on Vercel where single-
   * process Chromium leaks sockets / file descriptors / TIME_WAITs between
   * contexts, eventually causing page.goto to fail with
   * net::ERR_INSUFFICIENT_RESOURCES. Trading ~3-5s per recycle for a
   * pristine network stack per page.
   */
  recyclePerPage?: boolean;
}

export class BrowserPool {
  private browserPromise: Promise<Browser> | null = null;
  private inUse = 0;
  private waiters: Array<() => void> = [];
  private acquired: Set<BrowserContext> = new Set();

  constructor(private opts: BrowserPoolOptions) {}

  private ensureBrowser(): Promise<Browser> {
    if (!this.browserPromise) {
      // Clear the cached promise on rejection so the next acquire gets a
      // fresh launch attempt rather than inheriting a sticky failure. Heavy
      // pages OOM the renderer on Vercel; we want each subsequent page to
      // try again independently instead of all failing fast off one ghost.
      this.browserPromise = launchWithTimeout().catch((err) => {
        this.browserPromise = null;
        throw err;
      });
    }
    return this.browserPromise;
  }

  async acquire(): Promise<BrowserContext> {
    if (this.inUse >= this.opts.maxContexts) {
      await new Promise<void>((resolve) => this.waiters.push(resolve));
    }
    this.inUse += 1;
    try {
      let browser = await this.ensureBrowser();
      // Heavy pages (Stripe API docs render to ~1 MB of DOM) can OOM the
      // single-process Chromium on Vercel. The browser instance survives
      // as an object but its underlying process is dead. Relaunch when
      // we detect that so subsequent pages get a working renderer.
      if (!browser.isConnected()) {
        this.browserPromise = null;
        browser = await this.ensureBrowser();
      }
      const ctx = await browser.newContext({
        userAgent: this.opts.userAgent,
        bypassCSP: true,
      });
      this.acquired.add(ctx);
      return ctx;
    } catch (err) {
      // Release the slot we claimed so other workers don't deadlock waiting
      // for a context that will never arrive.
      this.inUse -= 1;
      const next = this.waiters.shift();
      if (next) next();
      throw err;
    }
  }

  async release(ctx: BrowserContext): Promise<void> {
    if (!this.acquired.has(ctx)) return;
    this.acquired.delete(ctx);
    try {
      await ctx.close();
    } catch {
      // Closing a context whose underlying browser already died throws.
      // Not actionable here — the next acquire will detect via isConnected
      // and relaunch. Just unblock the queue.
    }
    if (this.opts.recyclePerPage) {
      // Tear down the browser process entirely so the next acquire starts
      // with a fresh socket pool / file-descriptor budget / heap.
      await this.shutdownBrowser();
    }
    this.inUse -= 1;
    const next = this.waiters.shift();
    if (next) next();
  }

  private async shutdownBrowser(): Promise<void> {
    if (!this.browserPromise) return;
    const promise = this.browserPromise;
    this.browserPromise = null;
    const browser = await promise.catch(() => null);
    if (!browser) return;
    try {
      await browser.close();
    } catch {
      // Already dead — fine.
    }
  }

  async close(): Promise<void> {
    await this.shutdownBrowser();
  }
}

/**
 * On Vercel (and other Lambda-class hosts) Playwright's bundled Chromium isn't
 * present, so we launch using the AWS-Lambda-compatible Chromium binary shipped
 * separately by @sparticuz/chromium-min. The package fetches and caches the
 * Brotli-compressed tar in /tmp on first call; subsequent calls in the same
 * function instance return the extracted path immediately. Local dev keeps
 * Playwright's auto-managed binary.
 */
async function buildLaunchOptions(): Promise<LaunchOptions> {
  if (process.env.VERCEL !== "1") {
    return { headless: true };
  }
  const { default: sparticuz } = await import("@sparticuz/chromium-min");
  // Disable WebGL / SwiftShader before reading args or executablePath: in
  // single-process mode on Vercel's tight /tmp budget the GPU command
  // buffer fails to allocate its ring buffer, which kills the renderer
  // with SIGTRAP. Docs are text — we don't need WebGL. Setting this here
  // also skips inflating swiftshader.tar.br, freeing ~30 MB of /tmp.
  sparticuz.setGraphicsMode = false;
  return {
    args: sparticuz.args,
    executablePath: await sparticuz.executablePath(SPARTICUZ_TAR_URL),
    headless: true,
  };
}

async function launchWithTimeout(): Promise<Browser> {
  const options = await buildLaunchOptions();
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`Chromium launch timed out after ${LAUNCH_TIMEOUT_MS / 1000}s`)),
      LAUNCH_TIMEOUT_MS,
    );
  });
  try {
    return await Promise.race([chromium.launch(options), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
