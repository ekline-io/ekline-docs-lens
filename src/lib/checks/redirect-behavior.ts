import { fetchUrl } from "../fetch";
import type { AuditEntry, CheckResult } from "../types";

/**
 * Check the homepage's redirect behaviour. Looks at three things:
 *  1. Server-side redirect chain (3xx hops captured by fetchUrl).
 *     Long chains (>2 hops) waste agent fetch budget.
 *  2. Use of meta-refresh in the final HTML body. Meta-refresh is
 *     invisible to non-rendering agents.
 *  3. Use of `window.location` JS redirects. Same problem as above
 *     for raw HTTP fetchers.
 *
 * Pass: zero or one server redirect, no meta-refresh, no JS redirect.
 * Warn: 2-3 hop chain or a meta-refresh present alongside a real
 *       server redirect (defensive layering, but extra hops).
 * Fail: meta-refresh / JS redirect with NO server-side redirect (the
 *       page is unreachable for raw HTTP fetchers).
 */
export async function checkRedirectBehavior(baseUrl: string): Promise<CheckResult> {
  const audit: AuditEntry[] = [];
  // We use fetchUrl directly here (not auditedFetch) because we need the
  // redirectChain — auditedFetch only captures one entry per call.
  let res: Awaited<ReturnType<typeof fetchUrl>> | null = null;
  try {
    res = await fetchUrl(baseUrl);
    audit.push({
      method: "GET",
      url: baseUrl,
      status: res.statusCode,
      headers: {
        "content-type":
          (typeof res.headers["content-type"] === "string"
            ? res.headers["content-type"]
            : Array.isArray(res.headers["content-type"])
              ? res.headers["content-type"][0] ?? ""
              : "") || "",
      },
      note: `final URL: ${res.finalUrl}`,
    });
    // Surface every redirect hop as its own audit entry for traceability.
    for (const hop of res.redirectChain) {
      audit.push({
        method: "GET",
        url: hop.from,
        status: hop.status,
        note: `→ ${hop.to}${hop.sameHost ? "" : " (cross-host)"}`,
      });
    }
  } catch (e) {
    audit.push({
      method: "GET",
      url: baseUrl,
      status: 0,
      note: e instanceof Error ? e.message : "fetch failed",
    });
    return {
      id: "redirect-behavior",
      category: "url-stability",
      severity: "info",
      title: "Redirect behaviour couldn't be checked",
      message: "The homepage didn't respond.",
      source: "AFDocs v0.3.0 §6.2 (redirect-behavior)",
      impl: "src/lib/checks/redirect-behavior.ts",
      audit,
      conclusion: "Homepage probe failed",
    };
  }

  const chainLen = res.redirectChain.length;
  const body = res.body;

  // Detect meta-refresh tags. Match <meta http-equiv="refresh" content="0; url=...">
  // case-insensitively. We don't try to follow it; presence is the signal.
  const metaRefresh =
    /<meta[^>]+http-equiv\s*=\s*["']?refresh["']?[^>]*>/i.test(body);

  // Detect JS redirects in the body. Conservative regex — looks for
  // `window.location = …` or `location.href = …` or `location.replace(…)`.
  // False positives are possible (e.g. analytics referencing location), so we
  // only use this signal when chainLen === 0 — i.e. the only way the agent
  // could be redirected is via JS.
  const jsRedirect =
    /\b(?:window\.)?location\s*(?:\.href|\.replace|\.assign)?\s*=\s*['"]https?:\/\//i.test(
      body,
    ) || /\blocation\.replace\s*\(\s*['"]https?:\/\//i.test(body);

  if (chainLen === 0 && metaRefresh) {
    return {
      id: "redirect-behavior",
      category: "url-stability",
      severity: "fail",
      title: "Homepage relies on a meta-refresh redirect",
      message: `The homepage returns a 200 with a <meta http-equiv="refresh"> tag instead of a server-side 3xx. Raw HTTP fetchers (Claude Code, Cursor, Continue) don't honour meta-refresh — they sit on the redirect-page contents.`,
      fix: 'Replace the meta-refresh with a server-side 301 (permanent) or 302 (temporary). Add `Location: …` header instead of meta tag.',
      source: "AFDocs v0.3.0 §6.2 (redirect-behavior)",
      impl: "src/lib/checks/redirect-behavior.ts",
      audit,
      conclusion: "Meta-refresh redirect with no server-side 3xx",
    };
  }

  if (chainLen === 0 && jsRedirect) {
    return {
      id: "redirect-behavior",
      category: "url-stability",
      severity: "fail",
      title: "Homepage relies on a JavaScript redirect",
      message: "The homepage returns a 200 whose body sets window.location to a different URL. Raw HTTP fetchers (no JS) read the redirect-page body, not the destination.",
      fix: "Move the redirect server-side. Issue a 301 from your CDN/origin instead of redirecting in JS.",
      source: "AFDocs v0.3.0 §6.2 (redirect-behavior)",
      impl: "src/lib/checks/redirect-behavior.ts",
      audit,
      conclusion: "JS redirect with no server-side 3xx",
    };
  }

  if (chainLen >= 4) {
    return {
      id: "redirect-behavior",
      category: "url-stability",
      severity: "warn",
      title: "Long redirect chain on the homepage",
      message: `The homepage goes through ${chainLen} redirect hops before reaching a 200. Each hop is a separate fetch agents pay for; some fetchers cap chain length and abandon the request.`,
      fix: "Collapse redirect chains. Common offenders: HTTP→HTTPS + www→non-www + trailing-slash + locale prefix all stacked. Pick one canonical and redirect there directly.",
      source: "AFDocs v0.3.0 §6.2 (redirect-behavior)",
      impl: "src/lib/checks/redirect-behavior.ts",
      audit,
      conclusion: `${chainLen}-hop redirect chain`,
    };
  }

  if (chainLen >= 2 && metaRefresh) {
    return {
      id: "redirect-behavior",
      category: "url-stability",
      severity: "warn",
      title: "Server redirects plus a meta-refresh",
      message: `Homepage server-redirects ${chainLen} times AND the final body has a meta-refresh tag. Most fetchers handle this, but the redundant hop wastes budget.`,
      fix: "Drop the meta-refresh — your server-side 301s already do the job.",
      source: "AFDocs v0.3.0 §6.2 (redirect-behavior)",
      impl: "src/lib/checks/redirect-behavior.ts",
      audit,
      conclusion: `${chainLen} server redirect(s) + meta-refresh`,
    };
  }

  return {
    id: "redirect-behavior",
    category: "url-stability",
    severity: "pass",
    title:
      chainLen === 0
        ? "Homepage returns 200 directly"
        : "Homepage uses clean server-side redirects",
    message:
      chainLen === 0
        ? "No redirects on the homepage. Agents reach the content on the first fetch."
        : `Homepage redirects ${chainLen} time(s) via server-side 3xx, no meta-refresh or JS redirects. Clean and predictable for every fetcher.`,
    source: "AFDocs v0.3.0 §6.2 (redirect-behavior)",
    impl: "src/lib/checks/redirect-behavior.ts",
    audit,
    conclusion:
      chainLen === 0
        ? "Direct 200, no redirects"
        : `Clean ${chainLen}-hop server redirect to ${res.finalUrl}`,
  };
}

