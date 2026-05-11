import { auditedFetch, header } from "../fetch";
import type { AuditEntry, CheckResult } from "../types";

export async function checkMarkdownUrl(pageUrl: string): Promise<CheckResult> {
  const u = new URL(pageUrl);
  if (u.pathname.endsWith(".md")) {
    return {
      id: "markdown-url-support",
      category: "content-accessibility",
      severity: "pass",
      title: "Agents can fetch your docs as clean markdown",
      message:
        "This URL already ends in .md, so agents are receiving plain markdown without the HTML-to-markdown conversion that loses fidelity.",
      source: "AFDocs v0.3.0 §2.1 (markdown-url-support)",
      impl: "src/lib/checks/markdown-support.ts",
      conclusion: "URL already ends in .md",
    };
  }

  const path = u.pathname === "/" ? "/index" : u.pathname.replace(/\/$/, "");
  const mdUrl = `${u.origin}${path}.md${u.search}`;
  const audit: AuditEntry[] = [];
  const res = await auditedFetch(mdUrl, audit, {
    note: "probe .md variant",
  });

  if (!res) {
    return {
      id: "markdown-url-support",
      category: "content-accessibility",
      severity: "fail",
      title: "Agents have to convert your HTML to markdown themselves",
      message: "The .md variant URL is unreachable.",
      source: "AFDocs v0.3.0 §2.1 (markdown-url-support)",
      impl: "src/lib/checks/markdown-support.ts",
      audit,
      conclusion: `${mdUrl} unreachable`,
    };
  }

  const ct = header(res.headers, "content-type") ?? "";
  const isMd = ct.includes("text/markdown") || ct.includes("text/plain");
  if (res.statusCode === 200 && isMd && !res.body.trim().startsWith("<")) {
    return {
      id: "markdown-url-support",
      category: "content-accessibility",
      severity: "pass",
      title: "Agents can fetch your docs as clean markdown",
      message:
        "Appending .md to this URL returns real markdown. Agents that know this convention (Claude Code, Cursor) skip the lossy HTML-to-markdown conversion and read your content directly.",
      source: "AFDocs v0.3.0 §2.1 (markdown-url-support)",
      impl: "src/lib/checks/markdown-support.ts",
      details: { mdUrl, contentType: ct, bytes: res.bytes },
      audit,
      conclusion: `${mdUrl} returns ${ct} (${Math.round(res.bytes / 1024)} KB)`,
    };
  }

  return {
    id: "markdown-url-support",
    category: "content-accessibility",
    severity: "fail",
    title: "Agents have to convert your HTML to markdown themselves",
    message: `There's no .md variant of this URL, ${mdUrl} returns ${res.statusCode || "an error"}. Agents run your HTML through a conversion pipeline that drops inline styles, reorders code blocks, and sometimes silently truncates long pages.`,
    fix: "Configure your docs platform to serve a .md URL variant for every page. Mintlify, Docusaurus, Nextra, and Fern all support this with a config flag.",
    source: "AFDocs v0.3.0 §2.1 (markdown-url-support)",
    impl: "src/lib/checks/markdown-support.ts",
    details: { mdUrl, status: res.statusCode },
    audit,
    conclusion: `${mdUrl} returned HTTP ${res.statusCode} (content-type: ${ct || "—"})`,
  };
}

export async function checkContentNegotiation(pageUrl: string): Promise<CheckResult> {
  const audit: AuditEntry[] = [];
  const res = await auditedFetch(pageUrl, audit, {
    extraHeaders: { accept: "text/markdown" },
    note: "Accept: text/markdown",
  });

  if (!res) {
    return {
      id: "content-negotiation",
      category: "content-accessibility",
      severity: "fail",
      title: "Content negotiation couldn't be tested",
      message: "The page didn't respond when we asked for markdown.",
      source: "AFDocs v0.3.0 §2.2 (content-negotiation)",
      impl: "src/lib/checks/markdown-support.ts",
      audit,
      conclusion: `${pageUrl} unreachable with Accept: text/markdown`,
    };
  }

  const ct = header(res.headers, "content-type") ?? "";
  const isMd = ct.includes("text/markdown");
  const looksLikeMarkdown =
    !res.body.trim().startsWith("<!") && !res.body.trim().startsWith("<html");

  if (res.statusCode === 200 && isMd) {
    return {
      id: "content-negotiation",
      category: "content-accessibility",
      severity: "pass",
      title: "Your server answers agents in the format they ask for",
      message:
        "When an agent sends Accept: text/markdown, your server returns markdown with the correct Content-Type. Claude Code, Cursor, and OpenCode all use this negotiation path.",
      source: "AFDocs v0.3.0 §2.2 (content-negotiation)",
      impl: "src/lib/checks/markdown-support.ts",
      audit,
      conclusion: `Server returns text/markdown for Accept: text/markdown`,
    };
  }
  if (res.statusCode === 200 && looksLikeMarkdown) {
    return {
      id: "content-negotiation",
      category: "content-accessibility",
      severity: "warn",
      title: "Your server returns markdown but mislabels it",
      message: `Body looks like markdown but Content-Type is "${ct}". Strict agents discard the response because the declared type doesn't match what they asked for.`,
      fix: "Set the response Content-Type header to text/markdown; charset=utf-8 when you serve markdown bodies.",
      source: "AFDocs v0.3.0 §2.2 (content-negotiation)",
      impl: "src/lib/checks/markdown-support.ts",
      audit,
      conclusion: `Body parses as markdown but Content-Type is ${ct}`,
    };
  }
  return {
    id: "content-negotiation",
    category: "content-accessibility",
    severity: "fail",
    title: "Your server ignores agents asking for markdown",
    message: `When an agent sends Accept: text/markdown, your server returns HTML anyway (status ${res.statusCode}, type "${ct}"). Every coding agent that asks politely falls back to the HTML path, losing fidelity.`,
    fix: "Configure your docs server (or its CDN) to honor Accept: text/markdown by returning the markdown source of the page with the matching Content-Type.",
    source: "AFDocs v0.3.0 §2.2 (content-negotiation)",
    impl: "src/lib/checks/markdown-support.ts",
    audit,
    conclusion: `Server returned HTTP ${res.statusCode} with ${ct} despite Accept: text/markdown`,
  };
}
