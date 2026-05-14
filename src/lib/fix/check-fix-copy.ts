/**
 * Per-check fix copy used both in the UI ("why this matters") and in the
 * agent-fix prompt ("Common fixes" block). Single source of truth — adding
 * a new check should add a row here.
 *
 * `title` is a neutral rubric name (used as a methodology-page anchor and
 * heading), distinct from `check.title` in scan results which is the
 * failure-mode wording.
 * `short` is one line for the prompt's bullet list.
 * `long` is 1-3 sentences for the UI card and methodology page.
 */
export interface FixCopy {
  title: string;
  short: string;
  long: string;
}

const COPY: Record<string, FixCopy> = {
  "llms-txt-exists": {
    title: "llms.txt manifest",
    short:
      "Create /llms.txt following https://llmstxt.org, listing all doc pages in markdown format.",
    long:
      "An /llms.txt file (per the llmstxt.org spec) gives coding agents a manifest of your documentation. Without it, agents like Claude Code and Cursor have no shortcut to your structured docs and must crawl the whole site to find anything.",
  },
  "llms-txt-valid": {
    title: "llms.txt format validity",
    short:
      "Fix /llms.txt formatting. The file exists but has malformed entries that agents can't parse.",
    long:
      "Agents parse llms.txt as a structured manifest. Malformed lines cause the entire file to be discarded silently, undoing the discoverability win of having one.",
  },
  "llms-txt-size": {
    title: "llms.txt size budget",
    short:
      "Keep /llms.txt under 50 KB. Split into nested section-level llms.txt files if it grows past that.",
    long:
      "Tighter agent fetchers (MCP defaults to 5 KB, Cursor WebFetch to 28 KB, Claude Code truncates at 100 KB) only see the opening of an oversized llms.txt. Use the progressive-disclosure pattern: a small root file pointing to /docs/section/llms.txt files.",
  },
  "llms-txt-directive": {
    title: "llms.txt discovery directive",
    short:
      "Add an llms.txt directive (link or HTTP header) so agents can find it without guessing the path.",
    long:
      "Even if /llms.txt exists, agents only know to look for it if your homepage points to it (`<link rel=\"llms.txt\" href=\"/llms.txt\">` or an HTTP `Link` header).",
  },
  "llms-txt-links-resolve": {
    title: "llms.txt link integrity",
    short:
      "Every URL listed in /llms.txt must return 200. Broken links waste agent fetches.",
    long:
      "Each entry in llms.txt is a fetch budget the agent will spend. Broken URLs waste that budget and can cause agents to abandon the manifest entirely.",
  },
  "llms-txt-links-markdown": {
    title: "llms.txt link target format",
    short:
      "Serve every llms.txt-linked page as markdown (e.g. /docs/quickstart.md), not just HTML.",
    long:
      "llms.txt is supposed to point at machine-readable markdown. Linking HTML pages forces agents to do their own conversion, which loses code blocks and tables.",
  },
  "llms-txt-freshness": {
    title: "llms.txt freshness",
    short:
      "Regenerate /llms.txt on every docs deploy so it reflects the current page set.",
    long:
      "A stale llms.txt that lists removed pages or misses new ones is worse than none, since agents trust the manifest and stop looking elsewhere. Wire generation into your build pipeline so it can never drift.",
  },
  "markdown-url-support": {
    title: ".md URL variants",
    short:
      "Configure your docs platform to serve pages at equivalent .md URLs (e.g. /docs/quickstart.md).",
    long:
      "Coding agents (Claude Code, Cursor, Continue) try the .md variant first to skip Turndown. If you only serve .html they have to convert lossy.",
  },
  "content-negotiation": {
    title: "Accept: text/markdown handling",
    short:
      "Return markdown when the request has Accept: text/markdown.",
    long:
      "Modern agent fetchers (Claude Code as of v2.1.105) send Accept: text/markdown. If your server ignores it and returns HTML anyway, you lose the markdown shortcut.",
  },
  "rendering-strategy": {
    title: "Server-side rendering",
    short:
      "Server-render or static-export your docs. Client-side rendering hides content from raw HTTP fetchers.",
    long:
      "Agents that don't run JavaScript (Claude Code WebFetch, Continue, Aider default) only see the initial HTML. CSR-only docs look empty to them.",
  },
  "page-size-html": {
    title: "HTML page size budget",
    short:
      "Reduce nav boilerplate, inline scripts, and repetitive markup. Aim for under 1MB HTML.",
    long:
      "Headless agent fetchers cap fetch size. A page that's mostly nav and JS exhausts the budget before reaching the content.",
  },
  "page-size-markdown": {
    title: "Markdown page size budget",
    short:
      "Trim the markdown output. Claude Code WebFetch caps at 100KB of markdown, and anything past that is lost.",
    long:
      "Claude Code's pipeline truncates at 100KB of markdown before any further processing. Long pages get cut mid-content.",
  },
  "content-start-position": {
    title: "Content start position",
    short:
      "Move the main content within the first 50% of the page. Push nav and announcements below.",
    long:
      "Many agent extractors heuristically prioritize early content. Pages where the actual answer starts past the halfway mark often get truncated before reaching it.",
  },
  "tabbed-content-serialization": {
    title: "Tabbed content serialization",
    short:
      "Render every tab variant in HTML, not via JS. Agents without browsers see only the first tab.",
    long:
      "JS-only tab widgets are invisible to raw HTTP fetchers. Either render all tab content in the source HTML, or serve a single linear version for non-JS readers.",
  },
  "metadata-completeness": {
    title: "Page metadata completeness",
    short:
      "Add `<title>`, `<meta name=\"description\">`, and OG tags to every doc page.",
    long:
      "Search-snippet readers (ChatGPT Search, Perplexity, You.com) only see your title and description. Missing metadata means missing citations.",
  },
  "auth-gate-detection": {
    title: "Auth gate detection",
    short:
      "Ensure docs pages return 200 without requiring login cookies or tokens.",
    long:
      "Auth-gated docs are invisible to every agent. If a portion needs to be gated, expose an auth-free public version or robots-index allowed subset.",
  },
  "auth-alternative-access": {
    title: "Auth alternative access path",
    short:
      "If auth is required, document the public alternative (anonymous read endpoint, mirror site).",
    long:
      "When auth is non-negotiable, give agents a path: a public mirror, an anonymous-read endpoint, or a documented API key the user can configure.",
  },
  "well-known-mcp-card": {
    title: "MCP server discovery (/.well-known/mcp.json)",
    short:
      "Publish /.well-known/mcp.json so agents can discover your MCP server.",
    long:
      "MCP-aware agents check /.well-known/mcp.json for capability metadata. Without it, even users who would benefit from your MCP server never get pointed to it.",
  },
  "well-known-agent-skills": {
    title: "Agent Skills discovery (/.well-known/agent-skills.json)",
    short:
      "Publish /.well-known/agent-skills.json so coding agents can discover task-specific skills.",
    long:
      "Skills are reusable agent capabilities scoped to your product. The well-known endpoint is how agents find them without manual config.",
  },
  "well-known-api-catalog": {
    title: "API catalog discovery (/.well-known/api-catalog)",
    short:
      "Publish /.well-known/api-catalog so agents can locate your OpenAPI/AsyncAPI specs.",
    long:
      "An api-catalog points agents at your API definitions. Without it, agents either guess paths or skip your API entirely.",
  },
  "link-header-api-catalog": {
    title: "Link header for API catalog",
    short:
      "Send `Link: </.well-known/api-catalog>; rel=\"api-catalog\"` on docs responses.",
    long:
      "The HTTP Link header is a lower-effort cousin of well-known endpoints. Even if you skip the file, the header tells agents where to look.",
  },
  "robots-txt": {
    title: "robots.txt AI crawler access",
    short:
      "Allow major AI crawlers (GPTBot, OAI-SearchBot, ClaudeBot, PerplexityBot) in /robots.txt.",
    long:
      "If robots.txt blocks agent crawlers, you're invisible to ChatGPT, Perplexity, and Claude.ai search even if your docs are otherwise perfect.",
  },
  "content-signals": {
    title: "Structured data (JSON-LD / Schema.org)",
    short:
      "Add JSON-LD or Schema.org structured data so answer engines can cite specific sections.",
    long:
      "Answer engines like Perplexity heavily favor structured-data-rich pages because the citation surface is more reliable.",
  },
  "http-status-codes": {
    title: "HTTP status code correctness",
    short:
      "Return the right status code. Soft 404s (200 + 'page not found' body) confuse agents.",
    long:
      "Agents trust status codes. A page that returns 200 but says 'not found' wastes the agent's budget on dead content.",
  },
  "redirect-behavior": {
    title: "Redirect behavior",
    short:
      "Use 301/308 for permanent redirects, 302/307 for temporary. Avoid HTML meta-refresh.",
    long:
      "JS or meta-refresh redirects break for agents that don't render. Server-side 3xx redirects work for everyone.",
  },
  "markdown-code-fence-validity": {
    title: "Code block language tags",
    short:
      "Wrap every code block in triple backticks with a language tag (```ts, ```python).",
    long:
      "Code blocks without language tags lose their type when converted to markdown, hurting both rendering and agent parsing of examples.",
  },
  "heading-hierarchy": {
    title: "Heading hierarchy",
    short:
      "Use exactly one H1 per page, then H2 for sections, H3 for subsections. No level skips.",
    long:
      "Agents use heading structure to chunk pages. Skipping levels (H1 → H4) or having multiple H1s makes chunking unreliable.",
  },
  "image-alt-coverage": {
    title: "Image alt text coverage",
    short:
      "Add alt text to every doc image. Agents and screen readers depend on it.",
    long:
      "Diagram images without alt text are invisible to non-vision agents. Even short alts ('Architecture: API → DB → Cache') help.",
  },
  "json-code-block-validity": {
    title: "JSON code block validity",
    short:
      "Make sure JSON code blocks are valid JSON. Trailing commas and comments break agent parsing.",
    long:
      "Agents often try to JSON.parse() example payloads. Invalid samples cause silent failures or fallback to text-only answers.",
  },
  "internal-link-integrity": {
    title: "Internal link integrity",
    short:
      "Fix broken internal links. Agents follow them and waste fetches on 404s.",
    long:
      "Broken internal links waste agent fetch budget and cause incomplete answers when a referenced section can't be reached.",
  },
  "oauth-discovery": {
    title: "OAuth / OIDC discovery",
    short:
      "Publish /.well-known/openid-configuration or /.well-known/oauth-authorization-server so agents can authenticate against your APIs.",
    long:
      "OAuth/OIDC discovery metadata lets coding agents programmatically obtain access tokens. Without it, the agent has to be hand-configured with your auth endpoints, and most won't bother.",
  },
  "oauth-protected-resource": {
    title: "OAuth protected resource metadata",
    short:
      "Publish /.well-known/oauth-protected-resource so agents know which authorization servers issue tokens for your APIs.",
    long:
      "RFC 9728 metadata describing your protected resource. Coding agents read this to discover which OAuth issuer they need to talk to before calling your API.",
  },
  "sitemap": {
    title: "sitemap.xml",
    short: "Generate /sitemap.xml listing every public docs URL.",
    long: "A sitemap is the canonical index for crawlers and answer engines. Without one, ChatGPT Search, Perplexity, and Google AI Overviews fall back to following links from the homepage and miss pages that aren't navigable from there.",
  },
  "link-headers": {
    title: "HTTP Link header advertisements",
    short: 'Send Link headers on docs responses, e.g. `Link: </llms.txt>; rel="llms.txt"`.',
    long: "Link headers (RFC 8288) are the cheapest way for agents to discover capabilities, since they ride on every response with no extra fetch needed. Use them to advertise llms.txt, api-catalog, service-doc, and other discovery endpoints.",
  },
  "ai-bot-rules": {
    title: "AI bot rules in robots.txt",
    short: "Add explicit User-agent stanzas in /robots.txt for GPTBot, ClaudeBot, PerplexityBot, OAI-SearchBot, and Google-Extended.",
    long: "Without explicit User-agent rules, AI crawlers fall back to platform defaults that vary widely and may not match your intent. Naming each crawler explicitly puts you in control of who can crawl, who can train, and who can answer-engine-cite.",
  },
  "cache-headers": {
    title: "Cache validators (Last-Modified / ETag)",
    short: "Send Last-Modified or ETag headers on docs responses.",
    long: "Cache validators let agents skip the body when nothing changed (304 Not Modified). Without them, every fetch refetches the full response, which is wasteful for the agent's budget and your bandwidth.",
  },
  "web-bot-auth": {
    title: "Web Bot Auth signing keys",
    short: "If you run a bot that signs requests, publish /.well-known/http-message-signatures-directory.",
    long: "Web Bot Auth (RFC 9421) lets origin servers cryptographically verify that an inbound request really comes from a declared bot rather than a spoofed user-agent string. The signing-keys directory is the discovery endpoint.",
  },
  "a2a-agent-card": {
    title: "A2A agent card",
    short: "If your product itself acts as an agent, publish /.well-known/agent-card.json.",
    long: "Agent-to-Agent (A2A) discovery lets other agents find your service as a callable agent and learn its capabilities programmatically. Optional unless your product surfaces agent-like functionality.",
  },
};

export function fixCopyFor(checkId: string): FixCopy | null {
  return COPY[checkId] ?? null;
}

export function allFixCopyKeys(): string[] {
  return Object.keys(COPY);
}

/** Convenience for iterating every check with its full metadata in one pass. */
export function allFixCopyEntries(): Array<{ id: string; copy: FixCopy }> {
  return Object.entries(COPY).map(([id, copy]) => ({ id, copy }));
}
