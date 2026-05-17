
> ekline-docs-lens@0.1.0 audit:afdocs
> node scripts/audit-afdocs-rubric.mjs

# Rubric alignment audit — Docs Lens vs afdocs@0.18.7

**Docs Lens checks**: 42 · **afdocs checks**: 23 · **shared IDs**: 23

## Only in Docs Lens (19)

Checks afdocs does not run. If the visitor follows our methodology page and runs afdocs locally, they will get no signal on these.

- `llms-txt-freshness` — llms.txt freshness
- `metadata-completeness` — Page metadata completeness
- `well-known-mcp-card` — MCP server discovery (/.well-known/mcp.json)
- `well-known-agent-skills` — Agent Skills discovery (/.well-known/agent-skills.json)
- `well-known-api-catalog` — API catalog discovery (/.well-known/api-catalog)
- `link-header-api-catalog` — Link header for API catalog
- `robots-txt` — robots.txt AI crawler access
- `content-signals` — Structured data (JSON-LD / Schema.org)
- `heading-hierarchy` — Heading hierarchy
- `image-alt-coverage` — Image alt text coverage
- `json-code-block-validity` — JSON code block validity
- `internal-link-integrity` — Internal link integrity
- `oauth-discovery` — OAuth / OIDC discovery
- `oauth-protected-resource` — OAuth protected resource metadata
- `sitemap` — sitemap.xml
- `link-headers` — HTTP Link header advertisements
- `ai-bot-rules` — AI bot rules in robots.txt
- `web-bot-auth` — Web Bot Auth signing keys
- `a2a-agent-card` — A2A agent card

## Only in afdocs (0)

Checks afdocs runs that Docs Lens does not. The visitor will see *new* findings if they run afdocs.


## Shared IDs (23)

Same check ID on both sides. Severity, rubric logic, and thresholds may still diverge — this audit only compares IDs.

- `llms-txt-exists` — llms.txt manifest
- `llms-txt-valid` — llms.txt format validity
- `llms-txt-size` — llms.txt size budget
- `llms-txt-directive-html` — llms.txt directive on HTML pages
- `llms-txt-directive-md` — llms.txt directive on markdown pages
- `llms-txt-links-resolve` — llms.txt link integrity
- `llms-txt-links-markdown` — llms.txt link target format
- `markdown-url-support` — .md URL variants
- `content-negotiation` — Accept: text/markdown handling
- `rendering-strategy` — Server-side rendering
- `page-size-html` — HTML page size budget
- `page-size-markdown` — Markdown page size budget
- `content-start-position` — Content start position
- `tabbed-content-serialization` — Tabbed content serialization
- `auth-gate-detection` — Auth gate detection
- `auth-alternative-access` — Auth alternative access path
- `http-status-codes` — HTTP status code correctness
- `redirect-behavior` — Redirect behavior
- `markdown-code-fence-validity` — Code block language tags
- `cache-header-hygiene` — Cache validators (Last-Modified / ETag)
- `llms-txt-coverage` — llms.txt coverage of sitemap
- `markdown-content-parity` — Markdown content parity with HTML
- `section-header-quality` — Tab-variant headings include context
