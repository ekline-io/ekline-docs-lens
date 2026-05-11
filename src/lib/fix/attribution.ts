import type { ProfileId } from "@/lib/core/types";

/**
 * Hand-curated map of finding-id → affected profiles. Three real reader
 * populations only: rawHttp, headless, snippet. Anything not in this map
 * returns "general" — we will not fake attribution to make findings tag
 * fuller than the evidence supports.
 */
const ATTRIBUTION: Record<string, ProfileId[]> = {
  // llms.txt missing/broken: hurts every reader that consults it. Coding
  // agents (rawHttp) and search-snippet consumers both check llms.txt
  // for orientation; headless browsers usually don't.
  "llms-txt-exists": ["rawHttp", "snippet"],
  "llms-txt-valid": ["rawHttp", "snippet"],
  "llms-txt-directive": ["rawHttp", "snippet"],
  "llms-txt-links-resolve": ["rawHttp"],
  "llms-txt-links-markdown": ["rawHttp"],

  // Markdown URL support / content negotiation: only the rawHttp/coding-agent
  // family asks for markdown via Accept header. Headless and snippet don't.
  "markdown-url-support": ["rawHttp"],
  "content-negotiation": ["rawHttp"],

  // Rendering strategy (CSR vs SSR/SSG): hurts rawHttp and snippet because
  // both read pre-JS HTML. Headless renders post-JS so it's unaffected.
  "rendering-strategy": ["rawHttp", "snippet"],

  // Page size (markdown / HTML): bytes-budget concern hits rawHttp hardest
  // (Claude Code's WebFetch caps at 100KB markdown). Headless feeds richer
  // text but its consumers also have caps. Snippet only reads metadata so
  // page size doesn't affect it.
  "page-size-markdown": ["rawHttp"],
  "page-size-html": ["rawHttp", "headless"],
  "content-start-position": ["rawHttp"],

  // Tabbed content / JS-only widgets: rawHttp and snippet miss them; headless
  // sees them post-render.
  "tabbed-content-serialization": ["rawHttp", "snippet"],

  // Metadata completeness: snippet readers depend on title/description/OG
  // and nothing else.
  "metadata-completeness": ["snippet"],

  // Auth gating: blocks every reader that hits the URL.
  "auth-gate-detection": ["rawHttp", "headless", "snippet"],
  "auth-alternative-access": ["rawHttp", "headless", "snippet"],

  // Well-known endpoints (MCP, agent skills, API catalog): coding-agent
  // discovery surface. snippet readers also peek at API catalogs through
  // structured data.
  "well-known-mcp-card": ["rawHttp"],
  "well-known-agent-skills": ["rawHttp"],
  "well-known-api-catalog": ["rawHttp", "snippet"],
  "link-header-api-catalog": ["rawHttp"],
  "oauth-discovery": ["rawHttp"],
  "oauth-protected-resource": ["rawHttp"],

  // Robots policy / content signals: snippet/answer-engine consumers rely
  // on these.
  "robots-txt": ["snippet"],
  "content-signals": ["snippet"],

  // HTTP status / redirects / URL stability: every fetcher cares.
  "http-status-codes": ["rawHttp", "headless", "snippet"],
  "redirect-behavior": ["rawHttp", "headless", "snippet"],

  // Markdown structure issues affect rawHttp's Turndown output most directly;
  // headless re-runs Turndown on a richer DOM and survives more.
  "markdown-code-fence-validity": ["rawHttp"],
  "heading-hierarchy": ["rawHttp", "snippet"],
  "image-alt-coverage": ["rawHttp", "headless"],
  "json-code-block-validity": ["rawHttp"],
  "internal-link-integrity": ["rawHttp", "headless"],

  // Sitemap absence hurts answer engines (snippet) most, but coding agents
  // also fall back to it when llms.txt is missing.
  "sitemap": ["snippet", "rawHttp"],
  // Link headers are pure rawHttp surface — only fetchers that read response
  // headers benefit, and that's the coding-agent family.
  "link-headers": ["rawHttp"],
  // AI bot rules in robots.txt are read by the answer-engine snippet
  // crawlers (and by their training-time crawlers).
  "ai-bot-rules": ["snippet"],
  // Cache validators help every fetcher that revisits — coding agents
  // (rawHttp) and headless renderers both honour 304s.
  "cache-headers": ["rawHttp", "headless"],
  // Web Bot Auth signs requests, surfaced via snippet/answer-engine crawlers
  // that want to verify legitimate bot traffic.
  "web-bot-auth": ["snippet"],
  // A2A agent card lets coding agents discover the service as a callable
  // agent — pure rawHttp surface.
  "a2a-agent-card": ["rawHttp"],
};

export function attributionFor(findingId: string): ProfileId[] | "general" {
  const exact = ATTRIBUTION[findingId];
  if (exact) return exact;
  return "general";
}
