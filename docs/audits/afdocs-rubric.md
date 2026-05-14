# Rubric alignment audit — Docs Lens vs afdocs@0.18.7

**Docs Lens checks**: 38 · **afdocs checks**: 23 · **shared IDs**: 17

## Only in Docs Lens (21)

Checks afdocs does not run. If the visitor follows our methodology page and runs afdocs locally, they will get no signal on these.

- `llms-txt-directive` — llms-txt-directive
- `llms-txt-freshness` — llms-txt-freshness
- `metadata-completeness` — metadata-completeness
- `well-known-mcp-card` — well-known-mcp-card
- `well-known-agent-skills` — well-known-agent-skills
- `well-known-api-catalog` — well-known-api-catalog
- `link-header-api-catalog` — link-header-api-catalog
- `robots-txt` — robots-txt
- `content-signals` — content-signals
- `heading-hierarchy` — heading-hierarchy
- `image-alt-coverage` — image-alt-coverage
- `json-code-block-validity` — json-code-block-validity
- `internal-link-integrity` — internal-link-integrity
- `oauth-discovery` — oauth-discovery
- `oauth-protected-resource` — oauth-protected-resource
- `sitemap` — sitemap
- `link-headers` — link-headers
- `ai-bot-rules` — ai-bot-rules
- `cache-headers` — cache-headers
- `web-bot-auth` — web-bot-auth
- `a2a-agent-card` — a2a-agent-card

## Only in afdocs (6)

Checks afdocs runs that Docs Lens does not. The visitor will see *new* findings if they run afdocs.

- `llms-txt-directive-html` — Whether HTML pages include a directive pointing to llms.txt _[content-discoverability]_
- `llms-txt-directive-md` — Whether markdown pages include a directive pointing to llms.txt _[content-discoverability]_
- `section-header-quality` — Whether headers in tabbed sections include variant context _[content-structure]_
- `llms-txt-coverage` — How much of the site is represented in llms.txt _[observability]_
- `markdown-content-parity` — Whether markdown and HTML versions contain equivalent content _[observability]_
- `cache-header-hygiene` — Whether cache headers allow timely updates _[observability]_

## Shared IDs (17)

Same check ID on both sides. Severity, rubric logic, and thresholds may still diverge — this audit only compares IDs.

- `llms-txt-exists` — llms-txt-exists
- `llms-txt-valid` — llms-txt-valid
- `llms-txt-size` — llms-txt-size
- `llms-txt-links-resolve` — llms-txt-links-resolve
- `llms-txt-links-markdown` — llms-txt-links-markdown
- `markdown-url-support` — markdown-url-support
- `content-negotiation` — content-negotiation
- `rendering-strategy` — rendering-strategy
- `page-size-html` — page-size-html
- `page-size-markdown` — page-size-markdown
- `content-start-position` — content-start-position
- `tabbed-content-serialization` — tabbed-content-serialization
- `auth-gate-detection` — auth-gate-detection
- `auth-alternative-access` — auth-alternative-access
- `http-status-codes` — http-status-codes
- `redirect-behavior` — redirect-behavior
- `markdown-code-fence-validity` — markdown-code-fence-validity
