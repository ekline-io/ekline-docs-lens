import type { CheckResult } from "../types";

export function checkPageSize(rawHtmlBytes: number, markdownChars: number): CheckResult[] {
  return [htmlSize(rawHtmlBytes), mdSize(markdownChars)];
}

function htmlSize(bytes: number): CheckResult {
  const kb = Math.round(bytes / 1024);
  if (bytes <= 200_000) {
    return {
      id: "page-size-html",
      category: "page-size",
      severity: "pass",
      title: "Your HTML response is a reasonable size",
      message: `The raw HTML is ${kb} KB. Agents can fetch it without truncation at the network layer.`,
      source: "AFDocs v0.3.0 §3.3 (page-size-html)",
      impl: "server/src/checks/page-size.ts",
      details: { count: bytes, unit: "bytes" },
    };
  }
  if (bytes <= 500_000) {
    return {
      id: "page-size-html",
      category: "page-size",
      severity: "warn",
      title: "Most of your HTML isn't documentation",
      message: `Your raw HTML is ${kb} KB. Most of that is inline CSS and framework markup rather than content, agents on the HTML path spend a large share of their context budget on boilerplate before they reach anything useful.`,
      fix: "Move inline styles and scripts to external files. Agents don't execute JavaScript; inlining it only adds noise to what they parse.",
      source: "AFDocs v0.3.0 §3.3 (page-size-html)",
      impl: "server/src/checks/page-size.ts",
      details: { count: bytes, unit: "bytes" },
    };
  }
  return {
    id: "page-size-html",
    category: "page-size",
    severity: "fail",
    title: "Your HTML is too big for agents on the HTML path",
    message: `${kb} KB of HTML is past the point where agents can usefully parse it. Anyone not using the markdown variant sees a small fraction of your actual documentation.`,
    fix: "Serve a .md variant (see content-accessibility) so agents bypass the HTML pipeline entirely. Also: inline CSS and scripts should move to external files.",
    source: "AFDocs v0.3.0 §3.3 (page-size-html)",
    impl: "server/src/checks/page-size.ts",
    details: { count: bytes, unit: "bytes" },
  };
}

function mdSize(chars: number): CheckResult {
  const k = Math.round(chars / 1000);
  if (chars <= 50_000) {
    return {
      id: "page-size-markdown",
      category: "page-size",
      severity: "pass",
      title: "Agents receive your page in one piece",
      message: `After HTML-to-markdown conversion, your content is ${k}K characters. That fits comfortably in every major agent's context window.`,
      source: "AFDocs v0.3.0 §3.2 (page-size-markdown)",
      impl: "server/src/checks/page-size.ts",
      details: { count: chars, unit: "chars" },
    };
  }
  if (chars <= 100_000) {
    return {
      id: "page-size-markdown",
      category: "page-size",
      severity: "warn",
      title: "Agents with tighter budgets truncate mid-page",
      message: `${k}K characters of markdown sits above MCP Fetch's default (5K) and Cursor's WebFetch cap (28K). Claude Code still reads it whole, but other agents see only the top portion.`,
      fix: "Consider splitting this page, or expose a section-level markdown variant (like /page/section.md) so agents can request just what they need.",
      source: "AFDocs v0.3.0 §3.2 (page-size-markdown)",
      impl: "server/src/checks/page-size.ts",
      details: { count: chars, unit: "chars" },
    };
  }
  return {
    id: "page-size-markdown",
    category: "page-size",
    severity: "fail",
    title: "A chunk of your content is invisible to Claude Code",
    message: `${k}K characters crosses the 100K threshold where Claude Code routes the response through summarization before the model sees it. The middle third of your page gets compressed into a paragraph-long summary that drops most code examples.`,
    fix: "Break this page into smaller ones, or provide an /page.md variant that's narrower in scope. Claude Code delivers markdown under 100K directly to the model without any summarization.",
    source: "AFDocs v0.3.0 §3.2 (page-size-markdown)",
    impl: "server/src/checks/page-size.ts",
    details: { count: chars, unit: "chars" },
  };
}

export function checkContentStart(pct: number): CheckResult {
  const base = {
    id: "content-start-position",
    category: "page-size" as const,
    source: "AFDocs v0.3.0 §3.5 (content-start-position)",
    impl: "server/src/checks/page-size.ts",
    details: { pct },
  };
  if (pct <= 10) {
    return {
      ...base,
      severity: "pass",
      title: "Your content begins almost immediately in the response",
      message: `After HTML-to-markdown conversion, your actual documentation starts within the first ${pct}% of the response. Agents reach it before any context window pressure.`,
    };
  }
  if (pct <= 50) {
    return {
      ...base,
      severity: "warn",
      title: "Agents read a lot of boilerplate before reaching your content",
      message: `Your first real heading sits around ${pct}% of the response. That means the opening third of what agents receive is navigation, inlined CSS, and markup, only then does documentation appear.`,
      fix: "Move inline <style> blocks and large <script> payloads to external files. A lot of what's eating the preamble isn't documentation and doesn't need to be in the response at all.",
    };
  }
  return {
    ...base,
    severity: "fail",
    title: "Your content is buried past most agents' budgets",
    message: `Your first heading doesn't appear until ${pct}% into the response. Agents with smaller context windows (MCP default, Cursor WebFetch) never reach your content, everything they see is the framework shell and inline CSS.`,
    fix: "Extract inline CSS and JavaScript out of the HTML response entirely. Some agents strip these, but most don't; they just consume your budget.",
  };
}
