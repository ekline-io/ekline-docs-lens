import { auditedFetch } from "../fetch";
import type { AuditEntry, CheckResult } from "../types";

const AI_USER_AGENTS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "Claude-Web",
  "ClaudeBot",
  "anthropic-ai",
  "PerplexityBot",
  "Perplexity-User",
  "Google-Extended",
  "CCBot",
  "Bytespider",
];

export async function checkAiBotRules(baseUrl: string): Promise<CheckResult> {
  const origin = new URL(baseUrl).origin;
  const audit: AuditEntry[] = [];
  const res = await auditedFetch(`${origin}/robots.txt`, audit, {
    note: "probe robots.txt for AI bot rules",
  });

  if (!res || res.statusCode !== 200) {
    return {
      id: "ai-bot-rules",
      category: "capability-discovery",
      severity: "info",
      title: "AI bot rules can't be checked without robots.txt",
      message: "robots.txt isn't published, so AI crawlers fall back to each platform's defaults — which differ.",
      source: "robotstxt.org · AFDocs v0.3.0",
      impl: "src/lib/checks/ai-bots.ts",
      audit,
      conclusion: "robots.txt missing; can't evaluate AI bot rules",
    };
  }

  const body = res.body;
  // Find lines like "User-agent: GPTBot" (case-insensitive, with optional whitespace)
  const matched = AI_USER_AGENTS.filter((ua) =>
    new RegExp(`^\\s*User-agent\\s*:\\s*${ua}\\b`, "im").test(body),
  );

  if (matched.length >= 3) {
    return {
      id: "ai-bot-rules",
      category: "capability-discovery",
      severity: "pass",
      title: "You've taken a stance on which AI crawlers can access your docs",
      message: `robots.txt names ${matched.length} AI crawlers explicitly (${matched.join(", ")}). Each gets the rules you intend instead of falling back to defaults.`,
      source: "robotstxt.org · AFDocs v0.3.0",
      impl: "src/lib/checks/ai-bots.ts",
      audit,
      conclusion: `${matched.length} AI bot User-agent stanzas: ${matched.join(", ")}`,
    };
  }
  if (matched.length >= 1) {
    return {
      id: "ai-bot-rules",
      category: "capability-discovery",
      severity: "warn",
      title: "Only some AI crawlers are addressed in robots.txt",
      message: `robots.txt names ${matched.length} AI crawler(s) (${matched.join(", ")}) but ignores the others. The unaddressed crawlers fall back to platform defaults.`,
      fix: `Add User-agent stanzas for the major AI crawlers you don't already address. Common set: ${AI_USER_AGENTS.join(", ")}.`,
      source: "robotstxt.org · AFDocs v0.3.0",
      impl: "src/lib/checks/ai-bots.ts",
      audit,
      conclusion: `Only ${matched.length} AI bot stanza(s) found: ${matched.join(", ")}`,
    };
  }
  return {
    id: "ai-bot-rules",
    category: "capability-discovery",
    severity: "fail",
    title: "robots.txt doesn't address AI crawlers",
    message: "robots.txt exists but has no User-agent stanzas for GPTBot, ClaudeBot, PerplexityBot, or any other AI crawler. Each falls back to its platform's default behaviour.",
    fix: `Add explicit User-agent stanzas for the major AI crawlers. At minimum: ${AI_USER_AGENTS.slice(0, 6).join(", ")}.`,
    source: "robotstxt.org · AFDocs v0.3.0",
    impl: "src/lib/checks/ai-bots.ts",
    audit,
    conclusion: "No AI bot User-agent stanzas in robots.txt",
  };
}
