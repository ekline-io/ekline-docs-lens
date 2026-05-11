import { auditedFetch, header } from "../fetch";
import type { AuditEntry, CheckResult } from "../types";

/**
 * Each well-known spec lists one or more candidate paths. The first path that
 * returns 2xx wins; the audit captures every probe so users can see which
 * legacy/alternative paths we tried. Cloudflare's isitagentready.com probes
 * the same path families — we mirror them here.
 */
const WELL_KNOWN: Array<{
  id: string;
  paths: string[];
  label: string;
  rfc: string;
  readerBlurb: string;
}> = [
  {
    id: "well-known-api-catalog",
    paths: ["/.well-known/api-catalog"],
    label: "API catalog",
    rfc: "RFC 9727",
    readerBlurb:
      "Answer engines and agentic API clients look here to discover what your product exposes.",
  },
  {
    id: "well-known-mcp-card",
    paths: [
      "/.well-known/mcp.json",
      "/.well-known/mcp/server-card.json",
      "/.well-known/mcp/server-cards.json",
    ],
    label: "MCP server card",
    rfc: "Model Context Protocol (SEP-2127)",
    readerBlurb:
      "MCP-aware agents check here for a machine-readable description of your product's capabilities.",
  },
  {
    id: "well-known-agent-skills",
    paths: [
      "/.well-known/agent-skills/index.json",
      "/.well-known/skills/index.json",
    ],
    label: "Agent skills index",
    rfc: "Anthropic Agent Skills",
    readerBlurb:
      "Agents looking to invoke your product's capabilities discover them here.",
  },
];

export async function checkWellKnown(baseUrl: string): Promise<CheckResult[]> {
  const origin = new URL(baseUrl).origin;
  const results: CheckResult[] = [];
  for (const spec of WELL_KNOWN) {
    const audit: AuditEntry[] = [];
    let foundPath: string | null = null;
    let foundStatus = 0;
    for (const path of spec.paths) {
      const url = `${origin}${path}`;
      await auditedFetch(url, audit, {
        method: "HEAD",
        note: `probe ${spec.label}`,
      });
      const last = audit[audit.length - 1];
      const status = last?.status ?? 0;
      if (status >= 200 && status < 300) {
        foundPath = path;
        foundStatus = status;
        break;
      }
    }
    if (foundPath) {
      results.push({
        id: spec.id,
        category: "capability-discovery",
        severity: "pass",
        title: `Agents can discover your ${spec.label}`,
        message: `${foundPath} is present. ${spec.readerBlurb}`,
        source: spec.rfc,
        impl: "src/lib/checks/well-known.ts",
        details: { status: foundStatus, path: foundPath, candidates: spec.paths },
        audit,
        conclusion: `${spec.label} present at ${foundPath} (HTTP ${foundStatus})`,
      });
      continue;
    }
    const lastStatus = audit[audit.length - 1]?.status ?? 0;
    const allInconclusive = audit.every((a) => a.status === 0);
    if (allInconclusive) {
      results.push({
        id: spec.id,
        category: "capability-discovery",
        severity: "info",
        title: `${spec.label} probe was inconclusive`,
        message: "We couldn't reach those well-known endpoints from here; skipping.",
        source: spec.rfc,
        impl: "src/lib/checks/well-known.ts",
        audit,
        conclusion: `${spec.label} probe failed (no response)`,
      });
    } else {
      results.push({
        id: spec.id,
        category: "capability-discovery",
        severity: "info",
        title: `No ${spec.label} published`,
        message:
          spec.paths.length === 1
            ? `Nothing at ${spec.paths[0]}. Optional, most docs sites don't publish one — but without it, agents can't discover your product's machine-readable capabilities.`
            : `None of ${spec.paths.join(", ")} returned a card. Optional, most docs sites don't publish one.`,
        fix: `If your product exposes an API or MCP interface, publishing a ${spec.label} lets agents find and invoke it without human help. See ${spec.rfc} for the shape.`,
        source: spec.rfc,
        impl: "src/lib/checks/well-known.ts",
        details: { status: lastStatus, candidates: spec.paths },
        audit,
        conclusion: `${spec.label} not published (HTTP ${lastStatus})`,
      });
    }
  }
  return results;
}

export async function checkRobotsAndSignals(baseUrl: string): Promise<CheckResult[]> {
  const origin = new URL(baseUrl).origin;
  const results: CheckResult[] = [];
  const audit: AuditEntry[] = [];
  const robotsUrl = `${origin}/robots.txt`;
  const res = await auditedFetch(robotsUrl, audit, { note: "probe robots.txt" });
  if (res && res.statusCode === 200) {
    const hasContentSignal = /Content-Signal\s*:/i.test(res.body);
    const hasSitemap = /Sitemap\s*:/i.test(res.body);
    results.push({
      id: "robots-txt",
      category: "discoverability",
      severity: hasSitemap ? "pass" : "warn",
      title: hasSitemap ? "Crawlers can find your sitemap" : "Your robots.txt doesn't point to a sitemap",
      message: hasSitemap
        ? "robots.txt includes a Sitemap directive. Answer engines and search crawlers can find your full page list."
        : "robots.txt exists but lacks a Sitemap directive. Crawlers that rely on it have to guess at your page structure.",
      fix: hasSitemap
        ? undefined
        : "Add `Sitemap: https://your-site.com/sitemap.xml` to your robots.txt so crawlers have a canonical index.",
      source: "RFC 9309",
      impl: "server/src/checks/well-known.ts",
      audit: [...audit],
      conclusion: hasSitemap
        ? "robots.txt found with Sitemap directive"
        : "robots.txt found but no Sitemap directive",
    });
    results.push({
      id: "content-signals",
      category: "capability-discovery",
      severity: hasContentSignal ? "pass" : "info",
      title: hasContentSignal
        ? "You've declared your stance on AI training and answer-engine usage"
        : "No explicit policy on AI usage of your content",
      message: hasContentSignal
        ? "robots.txt includes Content-Signal directives. Crawlers that respect the spec know exactly what's allowed, training, answer-engine ingestion, search indexing."
        : "Without Content-Signal declarations, you rely on each crawler's default assumptions about what they can do with your content. Some default to permissive, some to restrictive.",
      fix: hasContentSignal
        ? undefined
        : "Add a Content-Signal line to robots.txt. A common choice for docs sites: `Content-Signal: search=yes, ai-input=yes, ai-train=no`.",
      source: "Cloudflare Agent Readiness · Content Signals",
      impl: "server/src/checks/well-known.ts",
      audit: [...audit],
      conclusion: hasContentSignal
        ? "Content-Signal directive declared in robots.txt"
        : "No Content-Signal directive in robots.txt",
    });
  } else {
    const status = audit[audit.length - 1]?.status ?? 0;
    results.push({
      id: "robots-txt",
      category: "discoverability",
      severity: "warn",
      title: "You don't have a robots.txt",
      message: `Your site returns ${status || "no response"} for /robots.txt. Crawlers fall back to each platform's defaults, which vary.`,
      source: "RFC 9309",
      impl: "server/src/checks/well-known.ts",
      audit: [...audit],
      conclusion: `robots.txt missing (HTTP ${status || "ERR"})`,
    });
  }
  return results;
}

export async function checkLinkHeader(baseUrl: string, headers: Record<string, string | string[] | undefined>): Promise<CheckResult> {
  const link = header(headers, "link");
  if (link && /rel=["']?api-catalog["']?/.test(link)) {
    return {
      id: "link-header-api-catalog",
      category: "capability-discovery",
      severity: "pass",
      title: "Your API catalog is advertised in the response headers",
      message: "The Link header points agents at your API catalog, which is the fastest way for them to discover it.",
      source: "RFC 8288",
      impl: "server/src/checks/well-known.ts",
      conclusion: "Link header advertises an api-catalog rel",
    };
  }
  return {
    id: "link-header-api-catalog",
    category: "capability-discovery",
    severity: "info",
    title: "No API catalog advertised in response headers",
    message: "Your response doesn't include a Link header pointing at an API catalog. This is optional, but advertising it via Link is the cheapest way for agents to discover capabilities without an extra fetch.",
    fix: 'Add `Link: </.well-known/api-catalog>; rel="api-catalog"` to your responses if you publish an API catalog.',
    source: "RFC 8288",
    impl: "server/src/checks/well-known.ts",
    conclusion: "No api-catalog rel in response Link header",
  };
}
