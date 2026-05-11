import type { FixFinding } from "./types";
import { fixCopyFor } from "./check-fix-copy";

export interface AgentFixPromptInput {
  siteUrl: string;
  siteName: string;
  score: number;
  grade: string;
  findings: FixFinding[];
}

/**
 * Generate the Fern-style agent-fix report. Self-contained markdown the user
 * pastes into Claude Code, Cursor, or any coding agent. Contains the score in
 * the header (the prompt is portable and needs the anchor) even though the UI
 * demotes the grade to a footer.
 */
export function generateAgentFixPrompt(input: AgentFixPromptInput): string {
  const fails = input.findings.filter((f) => f.severity === "fail");
  const warns = input.findings.filter((f) => f.severity === "warn");
  const lines: string[] = [];

  lines.push(`# Agent Score Fix Report — ${input.siteName}`);
  lines.push(`URL: ${input.siteUrl}`);
  lines.push(`Score: ${input.score}/100 (Grade ${input.grade})`);
  lines.push("");
  lines.push(
    `I need help improving the AI-readiness of the documentation at ${input.siteUrl}.`,
  );
  lines.push(
    `Docs Lens found ${fails.length} failing checks and ${warns.length} warnings.`,
  );
  lines.push("");

  lines.push(`## Failing Checks (${fails.length})`);
  for (const f of dedupeById(fails)) {
    lines.push(`- [${bareId(f.id)}] ${f.title}${f.evidence ? `: ${f.evidence}` : ""}`);
  }
  lines.push("");

  lines.push(`## Warnings (${warns.length})`);
  for (const w of dedupeById(warns)) {
    lines.push(`- [${bareId(w.id)}] ${w.title}${w.evidence ? `: ${w.evidence}` : ""}`);
  }
  lines.push("");

  lines.push("## Fix Instructions");
  lines.push("");
  lines.push("For each issue above, please:");
  lines.push(`1. Analyze the documentation site at ${input.siteUrl}`);
  lines.push(`2. Implement the specific fix`);
  lines.push(`3. Verify the fix would cause the check to pass`);
  lines.push("");

  const uniqueIds = uniqueIdsOf(input.findings).map(bareId);
  if (uniqueIds.length > 0) {
    lines.push("### Common fixes:");
    for (const id of uniqueIds) {
      const copy = fixCopyFor(id);
      if (copy) lines.push(`- **${humanLabel(id)}**: ${copy.short}`);
    }
    lines.push("");
  }

  lines.push("## Run afdocs Locally for More Detail");
  lines.push("");
  lines.push("To get deeper visibility into what's failing, run afdocs against your docs:");
  lines.push("");
  lines.push("```");
  lines.push(`  npx afdocs check ${input.siteUrl} --fixes --verbose`);
  lines.push("```");
  lines.push("");
  lines.push("- **--fixes**: Adds 'Fix:' lines to the output for each warn/fail check with actionable remediation steps");
  lines.push("- **-v, --verbose**: Shows per-page details (specific URLs, character counts, error codes)");

  return lines.join("\n");
}

function dedupeById(findings: FixFinding[]): FixFinding[] {
  const seen = new Set<string>();
  const out: FixFinding[] = [];
  for (const f of findings) {
    if (seen.has(f.id)) continue;
    seen.add(f.id);
    out.push(f);
  }
  return out;
}

/** Strip the "check:" / "diff:" / "site:" prefix some sources prepend to ids. */
function bareId(id: string): string {
  const colon = id.indexOf(":");
  if (colon === -1) return id;
  return id.slice(colon + 1);
}

function uniqueIdsOf(findings: FixFinding[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const f of findings) {
    if (seen.has(f.id)) continue;
    seen.add(f.id);
    out.push(f.id);
  }
  return out;
}

/** Human-readable label for the "Common fixes" bullet, e.g. "No llms.txt". */
function humanLabel(checkId: string): string {
  const map: Record<string, string> = {
    "llms-txt-exists": "No llms.txt",
    "llms-txt-valid": "Invalid llms.txt",
    "llms-txt-directive": "No llms.txt directive",
    "llms-txt-links-resolve": "Broken llms.txt links",
    "llms-txt-links-markdown": "llms.txt links to HTML, not markdown",
    "markdown-url-support": "No .md URL support",
    "content-negotiation": "No content negotiation",
    "rendering-strategy": "Client-side rendering only",
    "page-size-html": "HTML too large",
    "page-size-markdown": "Markdown too large",
    "content-start-position": "Content starts too late",
    "tabbed-content-serialization": "Tabs hidden behind JS",
    "metadata-completeness": "Missing meta tags",
    "auth-gate-detection": "Auth wall on docs",
    "auth-alternative-access": "No public access path",
    "well-known-mcp-card": "No MCP card",
    "well-known-agent-skills": "No agent skills card",
    "well-known-api-catalog": "No API catalog",
    "link-header-api-catalog": "No api-catalog Link header",
    "robots-txt": "Bots blocked in robots.txt",
    "content-signals": "Missing structured data",
    "http-status-codes": "Wrong status codes",
    "redirect-behavior": "Bad redirects",
    "markdown-code-fence-validity": "Code blocks without language tag",
    "heading-hierarchy": "Heading hierarchy issues",
    "image-alt-coverage": "Missing alt text",
    "json-code-block-validity": "Invalid JSON examples",
    "internal-link-integrity": "Broken internal links",
    "llms-txt-size": "llms.txt too large",
    "llms-txt-freshness": "llms.txt is stale",
    "oauth-discovery": "No OAuth discovery metadata",
    "oauth-protected-resource": "No OAuth Protected Resource metadata",
    "sitemap": "No sitemap.xml",
    "link-headers": "No Link headers",
    "ai-bot-rules": "No AI bot rules in robots.txt",
    "cache-headers": "No cache validators",
    "web-bot-auth": "No Web Bot Auth directory",
    "a2a-agent-card": "No A2A agent card",
  };
  return map[checkId] ?? checkId;
}
