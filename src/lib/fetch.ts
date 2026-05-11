import { request } from "undici";
import type { AuditEntry } from "./types";

export interface FetchResult {
  statusCode: number;
  headers: Record<string, string | string[] | undefined>;
  body: string;
  bytes: number;
  finalUrl: string;
  redirectChain: { from: string; to: string; status: number; sameHost: boolean }[];
}

const DEFAULT_HEADERS = {
  "user-agent": "docs-lens/0.1 (deterministic docs scanner; +https://ekline.io)",
  accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
};

export async function fetchUrl(
  url: string,
  extraHeaders: Record<string, string> = {},
  maxRedirects = 8,
  timeoutMs = 15_000,
): Promise<FetchResult> {
  const redirectChain: FetchResult["redirectChain"] = [];
  let currentUrl = url;

  for (let i = 0; i <= maxRedirects; i++) {
    const res = await request(currentUrl, {
      method: "GET",
      headers: { ...DEFAULT_HEADERS, ...extraHeaders },
      bodyTimeout: timeoutMs,
      headersTimeout: timeoutMs,
    } as Parameters<typeof request>[1]);
    const status = res.statusCode;
    const headers = res.headers as Record<string, string | string[] | undefined>;
    if (status >= 300 && status < 400 && headers.location) {
      const location = Array.isArray(headers.location) ? headers.location[0] : headers.location;
      const next = new URL(location, currentUrl).toString();
      const sameHost = new URL(next).host === new URL(currentUrl).host;
      redirectChain.push({ from: currentUrl, to: next, status, sameHost });
      await res.body.dump();
      currentUrl = next;
      continue;
    }
    const body = await res.body.text();
    return {
      statusCode: status,
      headers,
      body,
      bytes: Buffer.byteLength(body, "utf8"),
      finalUrl: currentUrl,
      redirectChain,
    };
  }
  throw new Error(`Too many redirects (${maxRedirects}) for ${url}`);
}

export async function headUrl(
  url: string,
  extraHeaders: Record<string, string> = {},
  timeoutMs = 10_000,
): Promise<{ statusCode: number; headers: Record<string, string | string[] | undefined> }> {
  try {
    const res = await request(url, {
      method: "HEAD",
      headers: { ...DEFAULT_HEADERS, ...extraHeaders },
      bodyTimeout: timeoutMs,
      headersTimeout: timeoutMs,
    } as Parameters<typeof request>[1]);
    await res.body.dump();
    return { statusCode: res.statusCode, headers: res.headers as Record<string, string | string[] | undefined> };
  } catch {
    return { statusCode: 0, headers: {} };
  }
}

export function header(
  headers: Record<string, string | string[] | undefined>,
  name: string,
): string | null {
  const v = headers[name.toLowerCase()];
  if (!v) return null;
  return Array.isArray(v) ? v[0] ?? null : v;
}

const AUDIT_HEADER_KEYS = [
  "content-type",
  "content-length",
  "last-modified",
  "etag",
  "x-robots-tag",
  "link",
];

function pickAuditHeaders(
  headers: Record<string, string | string[] | undefined>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of AUDIT_HEADER_KEYS) {
    const v = headers[k];
    if (typeof v === "string") out[k] = v;
    else if (Array.isArray(v) && v[0]) out[k] = v[0];
  }
  return out;
}

/**
 * Fetch a URL while appending the probe outcome to an audit trail. Used by
 * the site-level checks so each finding can show the literal HTTP requests
 * that led to its conclusion (matching what a user could rerun with curl).
 *
 * `fetchUrl` already follows redirects internally; the audit entry records
 * the final status. For a HEAD probe, `headUrl` is used so the request
 * doesn't pull a body we'll throw away.
 */
export async function auditedFetch(
  url: string,
  audit: AuditEntry[],
  opts: {
    extraHeaders?: Record<string, string>;
    note?: string;
    method?: "GET" | "HEAD";
  } = {},
): Promise<FetchResult | null> {
  const method = opts.method ?? "GET";
  try {
    if (method === "HEAD") {
      const head = await headUrl(url, opts.extraHeaders);
      audit.push({
        method,
        url,
        status: head.statusCode,
        headers: pickAuditHeaders(head.headers),
        note: opts.note,
      });
      return null;
    }
    const result = await fetchUrl(url, opts.extraHeaders);
    audit.push({
      method,
      url,
      status: result.statusCode,
      headers: pickAuditHeaders(result.headers),
      note: opts.note,
    });
    return result;
  } catch (e) {
    audit.push({
      method,
      url,
      status: 0,
      note: opts.note ?? (e instanceof Error ? e.message : "fetch failed"),
    });
    return null;
  }
}
