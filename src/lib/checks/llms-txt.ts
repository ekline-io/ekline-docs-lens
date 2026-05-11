import { auditedFetch } from "../fetch";
import type { AuditEntry, CheckResult } from "../types";

export async function checkLlmsTxt(baseUrl: string): Promise<CheckResult[]> {
  const origin = new URL(baseUrl).origin;
  const candidates = [`${origin}/llms.txt`, `${origin}/docs/llms.txt`];
  const audit: AuditEntry[] = [];

  for (const candidate of candidates) {
    const res = await auditedFetch(candidate, audit, {
      note: "probe llms.txt candidate",
    });
    if (res && res.statusCode === 200 && res.body.length > 0) {
      const conclusion = `llms.txt found at ${candidate} (${res.body.length} chars)`;
      return [
        {
          id: "llms-txt-exists",
          category: "discoverability",
          severity: "pass",
          title: "Agents can find a map of your docs",
          message: `You publish an llms.txt at ${candidate}. Agents that know to look for one have a reliable index to start from.`,
          source: "AFDocs v0.3.0 §1.1 (llms-txt-exists)",
          impl: "server/src/checks/llms-txt.ts",
          details: { location: candidate, bytes: res.bytes },
          audit: [...audit],
          conclusion,
        },
        sizeCheck(res.bytes, candidate, audit),
        validityCheck(res.body, audit),
      ];
    }
  }

  return [
    {
      id: "llms-txt-exists",
      category: "discoverability",
      severity: "fail",
      title: "Agents have no map of your documentation",
      message:
        "There's no llms.txt at your site root or under /docs. Coding agents fetching your docs for the first time have nothing to navigate from, they have to guess the URL structure or crawl.",
      fix: "Publish an llms.txt at your site root. Start with an H1 with your project name, a one-paragraph blockquote summary, and a list of markdown links to your main documentation pages.",
      source: "AFDocs v0.3.0 §1.1 (llms-txt-exists)",
      impl: "server/src/checks/llms-txt.ts",
      audit: [...audit],
      conclusion: "llms.txt not found at any candidate path",
    },
  ];
}

function sizeCheck(
  bytes: number,
  location: string,
  audit: AuditEntry[],
): CheckResult {
  const kb = Math.round(bytes / 1024);
  const base = {
    id: "llms-txt-size",
    category: "discoverability" as const,
    title: "Agents can fit your llms.txt in one fetch",
    source: "AFDocs v0.3.0 §1.3 (llms-txt-size)",
    impl: "server/src/checks/llms-txt.ts",
    details: { bytes, location },
    audit: [...audit],
  };
  if (bytes <= 50_000) {
    return {
      ...base,
      severity: "pass",
      message: `Your llms.txt is ${kb} KB. Every major agent platform fetches it whole, no truncation.`,
      conclusion: `${kb} KB at ${location}; fits every major fetch budget`,
    };
  }
  if (bytes <= 100_000) {
    return {
      ...base,
      severity: "warn",
      title: "Some agents will only see part of your llms.txt",
      message: `At ${kb} KB, your llms.txt is past the comfortable budget for tighter fetchers like MCP's default (5 KB) or Cursor's WebFetch (28 KB). They see only the opening links; the rest of your index is invisible to them.`,
      fix: "Split into nested llms.txt files, a small root index pointing to section-level files under /docs/section/llms.txt. Each file should stay under 50 KB.",
      conclusion: `${kb} KB at ${location}; over tighter fetcher budgets`,
    };
  }
  return {
    ...base,
    severity: "fail",
    title: "Your llms.txt is too large for every agent to read fully",
    message: `At ${kb} KB, your llms.txt exceeds Claude Code's 100 KB threshold. Agents see only the first chunk of your index; everything linked after the truncation point is unreachable to them.`,
    fix: "Adopt the progressive-disclosure pattern: a root llms.txt under 50 KB listing section entries, each pointing to a section-level llms.txt. Use absolute URLs between levels.",
    conclusion: `${kb} KB at ${location}; exceeds 100 KB cap`,
  };
}

function validityCheck(body: string, audit: AuditEntry[]): CheckResult {
  const hasH1 = /^#\s+/m.test(body);
  const hasBlockquote = /^>\s+/m.test(body);
  const linkCount = (body.match(/\[[^\]]+\]\([^)]+\)/g) ?? []).length;

  if (hasH1 && hasBlockquote && linkCount > 3) {
    return {
      id: "llms-txt-valid",
      category: "discoverability",
      severity: "pass",
      title: "Your llms.txt follows the expected shape",
      message: `H1 project name, blockquote summary, ${linkCount} link entries, agents parse this structure reliably.`,
      source: "AFDocs v0.3.0 §1.2 (llms-txt-valid)",
      impl: "server/src/checks/llms-txt.ts",
      audit: [...audit],
      conclusion: `valid shape: H1 + blockquote + ${linkCount} links`,
    };
  }
  const missing = [
    !hasH1 && "an H1 title",
    !hasBlockquote && "a blockquote summary",
    linkCount <= 3 && "a proper link list",
  ]
    .filter(Boolean)
    .join(" and ");
  return {
    id: "llms-txt-valid",
    category: "discoverability",
    severity: "warn",
    title: "Your llms.txt is hard for agents to parse reliably",
    message: `It's missing ${missing}. Agents fall back to best-effort extraction, which is less accurate than parsing a well-formed file.`,
    fix: "Follow the llmstxt.org shape: start with an H1 project name, add a blockquote paragraph describing what this docs set covers, then H2-delimited sections of markdown links.",
    source: "AFDocs v0.3.0 §1.2 (llms-txt-valid)",
    impl: "server/src/checks/llms-txt.ts",
    details: { hasH1, hasBlockquote, linkCount },
    audit: [...audit],
    conclusion: `missing ${missing}`,
  };
}
