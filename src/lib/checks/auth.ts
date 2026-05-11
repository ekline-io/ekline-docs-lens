import * as cheerio from "cheerio";
import type { CheckResult } from "../types";

// TODO(audit): populate audit trail (record HTTP probes via auditedFetch so
// the all-checks-list can show them).

const SSO_HOSTS = [
  "okta.com",
  "auth0.com",
  "login.microsoftonline.com",
  "login.salesforce.com",
  "accounts.google.com",
  "github.com/login",
];

export function checkAuthGate(
  finalUrl: string,
  redirectChain: { from: string; to: string; status: number; sameHost: boolean }[],
  html: string,
): CheckResult {
  const $ = cheerio.load(html);
  const hasPasswordField = $("input[type=password]").length > 0;
  const titleText = $("title").text().toLowerCase();
  const signinTitle = /sign[- ]?in|log[- ]?in|login/.test(titleText);

  const redirectedToSso = redirectChain.some((r) =>
    SSO_HOSTS.some((h) => r.to.includes(h)),
  );

  const base = {
    id: "auth-gate-detection",
    category: "authentication" as const,
    source: "AFDocs v0.3.0 §7.1 (auth-gate-detection)",
    impl: "server/src/checks/auth.ts",
  };

  if (redirectedToSso) {
    return {
      ...base,
      severity: "fail",
      title: "Your docs are behind single sign-on",
      message: `This URL redirects through ${redirectChain.map((r) => new URL(r.to).host).join(" → ")}. Agents can't complete SSO flows, they hit the login page and stop.`,
      fix: "If your reference docs are behind SSO, offer an alternative path: a public llms.txt index, a CLI with a `docs` subcommand, or an MCP server that authenticates server-side and exposes docs as tool calls.",
      details: { redirectChain },
    };
  }
  if (hasPasswordField && signinTitle) {
    return {
      ...base,
      severity: "fail",
      title: "This page is a login wall, not documentation",
      message: "The response contains a password field and the page title reads like a sign-in screen. Agents extract content from whatever they receive, so they'll treat the login form's surrounding copy as documentation.",
      fix: "Ungate your API reference and integration guides. Keep internal-only material (architecture docs, security runbooks) behind auth, but make the developer-facing surface public.",
    };
  }
  return {
    ...base,
    severity: "pass",
    title: "Agents can read this page without credentials",
    message: "The page responds publicly, with no redirect to SSO and no login form. Agents reach your documentation on the first fetch.",
  };
}
