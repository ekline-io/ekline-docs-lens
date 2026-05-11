import { fetchUrl } from "../fetch";
import type { CheckResult, Severity } from "../types";

export function checkRedirects(
  redirectChain: { from: string; to: string; status: number; sameHost: boolean }[],
  finalHtml: string,
): CheckResult {
  if (redirectChain.length === 0) {
    const jsRedirect = /<meta[^>]+http-equiv=["']refresh["']/i.test(finalHtml) ||
      /window\.location\s*=/.test(finalHtml);
    if (jsRedirect) {
      return {
        id: "redirect-behavior",
        category: "url-stability",
        severity: "fail",
        title: "Agents can't follow your redirects",
        message: "This page uses a JavaScript or <meta refresh> redirect. Coding agents don't run JavaScript, so they land on the redirect page itself and try to extract documentation from it.",
        fix: "Replace with a server-side HTTP 301 or 302 response. Agents follow those transparently.",
        source: "AFDocs v0.3.0 §5.2 (redirect-behavior)",
        impl: "server/src/checks/url-stability.ts",
      };
    }
    return {
      id: "redirect-behavior",
      category: "url-stability",
      severity: "pass",
      title: "Your URL resolves directly",
      message: "No redirects in the chain. Agents reach your content on the first fetch.",
      source: "AFDocs v0.3.0 §5.2 (redirect-behavior)",
      impl: "server/src/checks/url-stability.ts",
    };
  }
  const crossHost = redirectChain.some((r) => !r.sameHost);
  const severity: Severity = crossHost ? "warn" : "pass";
  return {
    id: "redirect-behavior",
    category: "url-stability",
    severity,
    title: crossHost
      ? "Your URL redirects across hosts, and some agents stop following there"
      : "Your redirects are transparent to agents",
    message: crossHost
      ? `This URL passes through ${redirectChain.length} redirect${redirectChain.length > 1 ? "s" : ""} to reach the final page, crossing hosts along the way. Claude Code and some other agents refuse to follow cross-host redirects automatically for security reasons, they land on the first host and stop.`
      : `${redirectChain.length} same-host redirect${redirectChain.length > 1 ? "s" : ""}, agents follow these without friction.`,
    fix: crossHost
      ? "Point your canonical URLs directly at the final destination, or keep the redirect chain within a single host."
      : undefined,
    source: "AFDocs v0.3.0 §5.2 (redirect-behavior)",
    impl: "server/src/checks/url-stability.ts",
    details: { chain: redirectChain },
  };
}

export async function checkSoftNotFound(baseUrl: string): Promise<CheckResult> {
  const u = new URL(baseUrl);
  const probe = `${u.origin}/this-path-definitely-does-not-exist-${Date.now()}`;
  try {
    const res = await fetchUrl(probe);
    if (res.statusCode === 404) {
      return {
        id: "http-status-codes",
        category: "url-stability",
        severity: "pass",
        title: "Missing pages return real 404s",
        message: "When an agent requests a page that doesn't exist, your server responds with 404. Agents know to stop extracting and try something else.",
        source: "AFDocs v0.3.0 §5.1 (http-status-codes)",
        impl: "server/src/checks/url-stability.ts",
      };
    }
    if (res.statusCode === 200) {
      return {
        id: "http-status-codes",
        category: "url-stability",
        severity: "fail",
        title: "Agents extract content from your error pages as if they were real",
        message: "A clearly-nonexistent path on your site returns 200 OK with a friendly error page. Agents can't tell the difference between a real page and a not-found fallback, they parse the error page and treat its content as documentation.",
        fix: "Configure your server or CDN to return HTTP 404 for non-existent paths. Save 200 for pages that actually exist.",
        source: "AFDocs v0.3.0 §5.1 (http-status-codes)",
        impl: "server/src/checks/url-stability.ts",
        details: { probed: probe, status: res.statusCode },
      };
    }
    return {
      id: "http-status-codes",
      category: "url-stability",
      severity: "warn",
      title: `Missing pages return an unusual status (${res.statusCode})`,
      message: "A nonexistent path returned something other than 404 or 200. Worth reviewing your server's 404 configuration.",
      source: "AFDocs v0.3.0 §5.1 (http-status-codes)",
      impl: "server/src/checks/url-stability.ts",
      details: { probed: probe, status: res.statusCode },
    };
  } catch {
    return {
      id: "http-status-codes",
      category: "url-stability",
      severity: "info",
      title: "Couldn't verify your 404 behavior",
      message: "The probe URL wasn't reachable from here.",
      source: "AFDocs v0.3.0 §5.1 (http-status-codes)",
      impl: "server/src/checks/url-stability.ts",
    };
  }
}
