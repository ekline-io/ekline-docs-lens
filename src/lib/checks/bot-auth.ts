import { auditedFetch, header } from "../fetch";
import type { AuditEntry, CheckResult } from "../types";

export async function checkWebBotAuth(baseUrl: string): Promise<CheckResult> {
  const origin = new URL(baseUrl).origin;
  const audit: AuditEntry[] = [];
  const url = `${origin}/.well-known/http-message-signatures-directory`;
  const res = await auditedFetch(url, audit, { note: "probe Web Bot Auth directory" });

  if (!res || res.statusCode !== 200) {
    const status = audit[audit.length - 1]?.status ?? 0;
    const inconclusive = status === 0;
    return {
      id: "web-bot-auth",
      category: "capability-discovery",
      severity: "info",
      title: inconclusive
        ? "Web Bot Auth probe was inconclusive"
        : "No Web Bot Auth directory",
      message: inconclusive
        ? "We couldn't reach the well-known endpoint from here."
        : "/.well-known/http-message-signatures-directory is not published. Optional — most docs sites don't need it. Useful when you want to cryptographically distinguish real bot traffic from UA spoofers.",
      fix: "If you operate a bot that signs its requests with HTTP Message Signatures (RFC 9421), publish your directory of signing keys at /.well-known/http-message-signatures-directory so origin servers can verify the signatures.",
      source: "RFC 9421 / Web Bot Auth",
      impl: "src/lib/checks/bot-auth.ts",
      audit,
      conclusion: inconclusive
        ? "Web Bot Auth probe failed (no response)"
        : `Web Bot Auth directory not published (HTTP ${status})`,
    };
  }

  const ct = header(res.headers, "content-type") ?? "";
  // Spec is JSON-shaped; accept anything with json or text/plain that parses
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(res.body);
  } catch {
    // not JSON — fall through
  }
  const looksValid = !!parsed && typeof parsed === "object";

  return {
    id: "web-bot-auth",
    category: "capability-discovery",
    severity: looksValid ? "pass" : "warn",
    title: looksValid
      ? "You publish a Web Bot Auth directory"
      : "Web Bot Auth directory present but malformed",
    message: looksValid
      ? "Servers receiving requests from your bot can cryptographically verify the signature against the keys you publish here."
      : `Server returned 200 for the directory but the body didn't parse as JSON (content-type: ${ct || "—"}). Verifiers reject malformed directories.`,
    fix: looksValid
      ? undefined
      : "Serve the directory as `application/json` with a structured key list per RFC 9421 §6.",
    source: "RFC 9421 / Web Bot Auth",
    impl: "src/lib/checks/bot-auth.ts",
    audit,
    conclusion: looksValid
      ? "Web Bot Auth directory present and parses as JSON"
      : "Web Bot Auth directory present but doesn't parse as JSON",
  };
}
