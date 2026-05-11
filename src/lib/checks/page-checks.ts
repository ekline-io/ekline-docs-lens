import * as cheerio from "cheerio";
import { headUrl } from "../fetch";
import type { AuditEntry, CheckResult } from "../types";
import type { PageResult } from "@/lib/core/run-types";

const MARKDOWN_CAP = 100_000; // Claude Code WebFetch threshold
const HTML_CAP = 1_000_000; // 1 MB; rule of thumb

/**
 * Per-page checks. Pure functions over the profile output. We only
 * need rawHttp (HTML + markdown) and headless (post-JS HTML + markdown).
 * Snippet is metadata only and doesn't drive these checks.
 *
 * Each returned CheckResult is for THIS page; the aggregator at the bottom
 * rolls them up into a single site-level CheckResult per check id.
 */

export function checkRenderingStrategy(page: PageResult): CheckResult {
  const raw = page.profiles.rawHttp;
  const headless = page.profiles.headless;
  if (!raw?.ok || !headless?.ok) {
    return {
      id: "rendering-strategy",
      category: "content-accessibility",
      severity: "info",
      title: "Rendering strategy couldn't be evaluated",
      message:
        "We need both the raw HTTP and headless fetches to compare. One of them failed.",
      source: "AFDocs v0.3.0 §3.1 (rendering-strategy)",
      impl: "src/lib/checks/page-checks.ts",
      details: { pageUrl: page.url, raw: raw?.ok, headless: headless?.ok },
      conclusion: "Rendering check skipped (profile fetch failure)",
    };
  }
  const rawChars = raw.chars;
  const headlessChars = headless.chars;
  const ratio = headlessChars > 0 ? rawChars / headlessChars : 1;
  if (ratio >= 0.85) {
    return {
      id: "rendering-strategy",
      category: "content-accessibility",
      severity: "pass",
      title: "Your content is server-rendered",
      message: `Raw HTTP saw ${Math.round(ratio * 100)}% of what headless saw on this page. Coding agents that don't run JS get the full content.`,
      source: "AFDocs v0.3.0 §3.1 (rendering-strategy)",
      impl: "src/lib/checks/page-checks.ts",
      details: { pageUrl: page.url, rawChars, headlessChars },
      conclusion: `Server-rendered (raw/headless ratio ${ratio.toFixed(2)})`,
    };
  }
  if (ratio >= 0.5) {
    return {
      id: "rendering-strategy",
      category: "content-accessibility",
      severity: "warn",
      title: "Some content is hidden behind JavaScript on this page",
      message: `Raw HTTP saw only ${Math.round(ratio * 100)}% of what headless saw (raw: ${rawChars} chars, headless: ${headlessChars} chars). The missing portion is JS-rendered — coding agents without browsers see less.`,
      fix: "Server-render or static-export the content that's currently injected by JavaScript. Rule of thumb: any text or code block that an agent might cite should be in the initial HTML.",
      source: "AFDocs v0.3.0 §3.1 (rendering-strategy)",
      impl: "src/lib/checks/page-checks.ts",
      details: { pageUrl: page.url, rawChars, headlessChars, ratio },
      conclusion: `Partial CSR (raw/headless ratio ${ratio.toFixed(2)})`,
    };
  }
  return {
    id: "rendering-strategy",
    category: "content-accessibility",
    severity: "fail",
    title: "Most of this page is hidden behind JavaScript",
    message: `Raw HTTP saw only ${Math.round(ratio * 100)}% of what headless saw. Coding agents (Claude Code, Cursor, Continue, Aider's default) see almost nothing on this page.`,
    fix: "Switch to SSR/SSG for docs pages, or pre-render the content that matters. CSR-only docs are invisible to the largest population of coding agents.",
    source: "AFDocs v0.3.0 §3.1 (rendering-strategy)",
    impl: "src/lib/checks/page-checks.ts",
    details: { pageUrl: page.url, rawChars, headlessChars, ratio },
    conclusion: `CSR-only (raw/headless ratio ${ratio.toFixed(2)})`,
  };
}

export function checkPageSize(page: PageResult): CheckResult[] {
  const raw = page.profiles.rawHttp;
  const out: CheckResult[] = [];

  // page-size-html
  if (raw?.ok) {
    const htmlBytes = raw.bytes;
    const sev: CheckResult["severity"] =
      htmlBytes <= HTML_CAP
        ? "pass"
        : htmlBytes <= HTML_CAP * 2
          ? "warn"
          : "fail";
    out.push({
      id: "page-size-html",
      category: "page-size",
      severity: sev,
      title:
        sev === "pass"
          ? "HTML payload is reasonable"
          : sev === "warn"
            ? "HTML payload is larger than typical"
            : "HTML payload is too large for many fetchers",
      message: `Raw HTML for this page is ${Math.round(htmlBytes / 1024)} KB.${
        sev === "pass"
          ? " Fetchers download it without straining their budgets."
          : sev === "warn"
            ? " Most fetchers handle it, but tighter agent budgets (Cursor, MCP defaults) may truncate."
            : " Likely truncated by every modern agent fetcher."
      }`,
      fix:
        sev === "pass"
          ? undefined
          : "Trim nav boilerplate, inline scripts, and embedded fonts. Aim for under 1 MB of HTML per page.",
      source: "AFDocs v0.3.0 §4.1 (page-size-html)",
      impl: "src/lib/checks/page-checks.ts",
      details: { pageUrl: page.url, htmlBytes },
      conclusion: `HTML size: ${Math.round(htmlBytes / 1024)} KB`,
    });
  }

  // page-size-markdown
  if (raw?.ok) {
    const mdChars = raw.chars;
    const sev: CheckResult["severity"] =
      mdChars <= MARKDOWN_CAP
        ? "pass"
        : mdChars <= MARKDOWN_CAP * 2
          ? "warn"
          : "fail";
    out.push({
      id: "page-size-markdown",
      category: "page-size",
      severity: sev,
      title:
        sev === "pass"
          ? "Converted markdown fits Claude Code's budget"
          : sev === "warn"
            ? "Markdown is past Claude Code's threshold"
            : "Markdown is too large for the dominant fetcher",
      message: `Raw HTTP markdown for this page is ${Math.round(mdChars / 1024)} KB.${
        sev === "pass"
          ? " Fits within Claude Code's 100 KB pipeline."
          : sev === "warn"
            ? " Past the 100 KB threshold; Claude Code WebFetch's pipeline truncates the tail."
            : " More than double the 100 KB threshold; the bottom of this page is unreachable."
      }`,
      fix:
        sev === "pass"
          ? undefined
          : "Split very long pages into shorter sections. Move reference tables to dedicated subpages.",
      source: "AFDocs v0.3.0 §4.2 (page-size-markdown)",
      impl: "src/lib/checks/page-checks.ts",
      details: { pageUrl: page.url, mdChars },
      conclusion: `Markdown size: ${Math.round(mdChars / 1024)} KB`,
    });
  }

  return out;
}

export function checkContentStartPosition(page: PageResult): CheckResult {
  const raw = page.profiles.rawHttp;
  if (!raw?.ok || !raw.markdown) {
    return {
      id: "content-start-position",
      category: "page-size",
      severity: "info",
      title: "Couldn't measure where content starts on this page",
      message: "Raw HTTP fetch failed.",
      source: "AFDocs v0.3.0 §4.3 (content-start-position)",
      impl: "src/lib/checks/page-checks.ts",
      details: { pageUrl: page.url },
      conclusion: "Skipped (no raw markdown)",
    };
  }
  const md = raw.markdown;
  const firstH1Idx = md.search(/^#\s+/m);
  if (firstH1Idx < 0) {
    return {
      id: "content-start-position",
      category: "page-size",
      severity: "warn",
      title: "No H1 found on this page",
      message:
        "Without an H1, agents that heuristically anchor on the page title can't find the start of content.",
      fix: "Add a top-level H1 at the start of the page's main content.",
      source: "AFDocs v0.3.0 §4.3 (content-start-position)",
      impl: "src/lib/checks/page-checks.ts",
      details: { pageUrl: page.url },
      conclusion: "No H1 detected in markdown",
    };
  }
  const startPct = Math.round((firstH1Idx / md.length) * 100);
  if (startPct <= 30) {
    return {
      id: "content-start-position",
      category: "page-size",
      severity: "pass",
      title: "Content starts early on this page",
      message: `Main content (first H1) appears at ${startPct}% of the markdown. Agents reach the substance before any truncation budget runs out.`,
      source: "AFDocs v0.3.0 §4.3 (content-start-position)",
      impl: "src/lib/checks/page-checks.ts",
      details: { pageUrl: page.url, startPct },
      conclusion: `H1 at ${startPct}% of page`,
    };
  }
  if (startPct <= 50) {
    return {
      id: "content-start-position",
      category: "page-size",
      severity: "warn",
      title: "Content starts past the first third of the page",
      message: `Main content begins at ${startPct}% of the markdown — the first third is nav, banners, or boilerplate. Tight fetch budgets cut into the actual content.`,
      fix: "Move nav/announcements to dedicated regions or below the main content. Heuristic extractors prefer pages where the H1 is in the first third.",
      source: "AFDocs v0.3.0 §4.3 (content-start-position)",
      impl: "src/lib/checks/page-checks.ts",
      details: { pageUrl: page.url, startPct },
      conclusion: `H1 at ${startPct}% of page`,
    };
  }
  return {
    id: "content-start-position",
    category: "page-size",
    severity: "fail",
    title: "Content starts past halfway down the page",
    message: `Main content (first H1) is at ${startPct}% of the markdown. Truncated fetchers see almost no real content.`,
    fix: `Move the page's nav/sidebar/banner content out of the main flow. Agents that truncate before ${startPct}% see only nav.`,
    source: "AFDocs v0.3.0 §4.3 (content-start-position)",
    impl: "src/lib/checks/page-checks.ts",
    details: { pageUrl: page.url, startPct },
    conclusion: `H1 at ${startPct}% of page`,
  };
}

export function checkHeadingHierarchy(page: PageResult): CheckResult {
  const raw = page.profiles.rawHttp;
  if (!raw?.ok || !raw.markdown) {
    return {
      id: "heading-hierarchy",
      category: "content-structure",
      severity: "info",
      title: "Couldn't evaluate heading hierarchy",
      message: "Raw HTTP fetch failed.",
      source: "AFDocs v0.3.0 §3.4 (heading-hierarchy)",
      impl: "src/lib/checks/page-checks.ts",
      details: { pageUrl: page.url },
      conclusion: "Skipped (no markdown)",
    };
  }
  const md = raw.markdown;
  const lines = md.split("\n");
  const levels: number[] = [];
  for (const line of lines) {
    const m = /^(#{1,6})\s+/.exec(line);
    if (m) levels.push(m[1]!.length);
  }
  const h1Count = levels.filter((l) => l === 1).length;
  const skips: string[] = [];
  for (let i = 1; i < levels.length; i++) {
    const prev = levels[i - 1]!;
    const cur = levels[i]!;
    if (cur > prev + 1) skips.push(`H${prev}->H${cur}`);
  }
  if (h1Count === 1 && skips.length === 0) {
    return {
      id: "heading-hierarchy",
      category: "content-structure",
      severity: "pass",
      title: "Heading hierarchy is clean",
      message:
        "One H1, no level skips. Agents that chunk on headings get a clean tree.",
      source: "AFDocs v0.3.0 §3.4 (heading-hierarchy)",
      impl: "src/lib/checks/page-checks.ts",
      details: { pageUrl: page.url, h1Count, skips: [] },
      conclusion: `1 H1, no level skips across ${levels.length} headings`,
    };
  }
  const issues: string[] = [];
  if (h1Count !== 1) issues.push(`${h1Count} H1${h1Count === 1 ? "" : "s"}`);
  if (skips.length > 0)
    issues.push(
      `${skips.length} level skip${skips.length === 1 ? "" : "s"} (${skips.slice(0, 3).join(", ")}${skips.length > 3 ? "..." : ""})`,
    );
  return {
    id: "heading-hierarchy",
    category: "content-structure",
    severity: "warn",
    title: h1Count === 0 ? "No H1 on this page" : "Heading hierarchy has issues",
    message: `Detected ${issues.join(", ")}. Heading-based chunkers (used by every embedding-driven retriever) misalign their splits.`,
    fix: "Use exactly one H1 per page (the page title). Then H2 for sections, H3 for subsections — no level skips.",
    source: "AFDocs v0.3.0 §3.4 (heading-hierarchy)",
    impl: "src/lib/checks/page-checks.ts",
    details: { pageUrl: page.url, h1Count, skips },
    conclusion: `Issues: ${issues.join(", ")}`,
  };
}

export function checkImageAltCoverage(page: PageResult): CheckResult {
  const raw = page.profiles.rawHttp;
  if (!raw?.ok || !raw.rawArtifact) {
    return {
      id: "image-alt-coverage",
      category: "content-structure",
      severity: "info",
      title: "Couldn't evaluate image alt coverage",
      message: "Raw HTTP fetch failed.",
      source: "AFDocs v0.3.0 §3.5 (image-alt-coverage)",
      impl: "src/lib/checks/page-checks.ts",
      details: { pageUrl: page.url },
      conclusion: "Skipped (no raw HTML)",
    };
  }
  const $ = cheerio.load(raw.rawArtifact);
  const imgs = $("img").toArray();
  const total = imgs.length;
  if (total === 0) {
    return {
      id: "image-alt-coverage",
      category: "content-structure",
      severity: "pass",
      title: "No images on this page",
      message: "Nothing to check.",
      source: "AFDocs v0.3.0 §3.5 (image-alt-coverage)",
      impl: "src/lib/checks/page-checks.ts",
      details: { pageUrl: page.url, total: 0, withAlt: 0 },
      conclusion: "No images present",
    };
  }
  const withAlt = imgs.filter((img) => {
    const alt = $(img).attr("alt");
    return typeof alt === "string" && alt.trim().length > 0;
  }).length;
  const pct = Math.round((withAlt / total) * 100);
  if (pct === 100) {
    return {
      id: "image-alt-coverage",
      category: "content-structure",
      severity: "pass",
      title: "Every image has alt text",
      message: `${total}/${total} images have alt attributes. Non-vision agents and screen readers can use them.`,
      source: "AFDocs v0.3.0 §3.5 (image-alt-coverage)",
      impl: "src/lib/checks/page-checks.ts",
      details: { pageUrl: page.url, total, withAlt },
      conclusion: `${withAlt}/${total} images with alt text`,
    };
  }
  const sev: CheckResult["severity"] = pct >= 80 ? "warn" : "fail";
  return {
    id: "image-alt-coverage",
    category: "content-structure",
    severity: sev,
    title:
      sev === "warn"
        ? "Some images are missing alt text"
        : "Most images are missing alt text",
    message: `${withAlt}/${total} images (${pct}%) have alt attributes. The rest are invisible to non-vision agents.`,
    fix: 'Add a short alt attribute to every <img>. For diagrams: name what\'s pictured (e.g. alt="Architecture: API → DB → Cache"). For decorative images: alt="".',
    source: "AFDocs v0.3.0 §3.5 (image-alt-coverage)",
    impl: "src/lib/checks/page-checks.ts",
    details: { pageUrl: page.url, total, withAlt, pct },
    conclusion: `${withAlt}/${total} images with alt (${pct}%)`,
  };
}

export function checkMarkdownCodeFences(page: PageResult): CheckResult {
  const raw = page.profiles.rawHttp;
  if (!raw?.ok || !raw.markdown) {
    return {
      id: "markdown-code-fence-validity",
      category: "content-structure",
      severity: "info",
      title: "Couldn't validate code fences",
      message: "Raw HTTP fetch failed.",
      source: "AFDocs v0.3.0 §3.6 (markdown-code-fence-validity)",
      impl: "src/lib/checks/page-checks.ts",
      details: { pageUrl: page.url },
      conclusion: "Skipped (no markdown)",
    };
  }
  const md = raw.markdown;
  const fences = md.match(/^```/gm) ?? [];
  const fenceCount = fences.length;
  const evenlyClosed = fenceCount % 2 === 0;
  const openFences = md.match(/^```[a-zA-Z0-9_+\-]+/gm) ?? [];
  const opens = Math.ceil(fenceCount / 2);
  const withLang = openFences.length;
  if (!evenlyClosed) {
    return {
      id: "markdown-code-fence-validity",
      category: "content-structure",
      severity: "fail",
      title: "Unclosed code fence in this page",
      message: `Found ${fenceCount} triple-backtick fences. An odd count means at least one block isn't closed, so agents converting back to markdown may swallow whole sections of prose into the open fence.`,
      fix: "Find the unmatched fence and close it. The surrounding prose is being mis-parsed as code.",
      source: "AFDocs v0.3.0 §3.6 (markdown-code-fence-validity)",
      impl: "src/lib/checks/page-checks.ts",
      details: { pageUrl: page.url, fenceCount },
      conclusion: `${fenceCount} fences (odd count, unclosed)`,
    };
  }
  if (opens === 0) {
    return {
      id: "markdown-code-fence-validity",
      category: "content-structure",
      severity: "pass",
      title: "No code blocks on this page",
      message: "Nothing to validate.",
      source: "AFDocs v0.3.0 §3.6 (markdown-code-fence-validity)",
      impl: "src/lib/checks/page-checks.ts",
      details: { pageUrl: page.url, fenceCount: 0 },
      conclusion: "No code fences",
    };
  }
  const langPct = Math.round((withLang / opens) * 100);
  if (langPct >= 90) {
    return {
      id: "markdown-code-fence-validity",
      category: "content-structure",
      severity: "pass",
      title: "Code blocks have language tags",
      message: `${withLang}/${opens} code blocks (${langPct}%) have a language tag. Agents can parse them with the right syntax.`,
      source: "AFDocs v0.3.0 §3.6 (markdown-code-fence-validity)",
      impl: "src/lib/checks/page-checks.ts",
      details: { pageUrl: page.url, opens, withLang, langPct },
      conclusion: `${withLang}/${opens} code blocks tagged`,
    };
  }
  return {
    id: "markdown-code-fence-validity",
    category: "content-structure",
    severity: "warn",
    title: "Most code blocks lack a language tag",
    message: `Only ${withLang}/${opens} code blocks (${langPct}%) have a language tag. Untagged blocks lose their type when re-converted from markdown to other formats.`,
    fix: "Add a language tag after the opening triple backticks (```ts, ```python, ```bash, ```json).",
    source: "AFDocs v0.3.0 §3.6 (markdown-code-fence-validity)",
    impl: "src/lib/checks/page-checks.ts",
    details: { pageUrl: page.url, opens, withLang, langPct },
    conclusion: `${withLang}/${opens} code blocks tagged (${langPct}%)`,
  };
}

export function checkJsonCodeBlocks(page: PageResult): CheckResult {
  const raw = page.profiles.rawHttp;
  if (!raw?.ok || !raw.markdown) {
    return {
      id: "json-code-block-validity",
      category: "content-structure",
      severity: "info",
      title: "Couldn't validate JSON code blocks",
      message: "Raw HTTP fetch failed.",
      source: "AFDocs v0.3.0 §3.7 (json-code-block-validity)",
      impl: "src/lib/checks/page-checks.ts",
      details: { pageUrl: page.url },
      conclusion: "Skipped",
    };
  }
  const md = raw.markdown;
  const re = /```json\s*\n([\s\S]*?)\n```/g;
  const blocks: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(md)) !== null) blocks.push(m[1] ?? "");
  if (blocks.length === 0) {
    return {
      id: "json-code-block-validity",
      category: "content-structure",
      severity: "pass",
      title: "No JSON code blocks on this page",
      message: "Nothing to validate.",
      source: "AFDocs v0.3.0 §3.7 (json-code-block-validity)",
      impl: "src/lib/checks/page-checks.ts",
      details: { pageUrl: page.url, total: 0 },
      conclusion: "No JSON blocks",
    };
  }
  const failures: string[] = [];
  for (const block of blocks) {
    try {
      JSON.parse(block);
    } catch (e) {
      failures.push((e as Error).message);
    }
  }
  if (failures.length === 0) {
    return {
      id: "json-code-block-validity",
      category: "content-structure",
      severity: "pass",
      title: "Every JSON code block parses",
      message: `${blocks.length}/${blocks.length} JSON blocks are valid JSON. Agents that JSON.parse() examples succeed.`,
      source: "AFDocs v0.3.0 §3.7 (json-code-block-validity)",
      impl: "src/lib/checks/page-checks.ts",
      details: { pageUrl: page.url, total: blocks.length },
      conclusion: `${blocks.length}/${blocks.length} JSON blocks valid`,
    };
  }
  return {
    id: "json-code-block-validity",
    category: "content-structure",
    severity: "warn",
    title: "Some JSON code blocks don't parse",
    message: `${failures.length}/${blocks.length} JSON blocks are invalid (e.g. trailing commas, comments). Agents that JSON.parse() example payloads fall back to text-only answers.`,
    fix: "Validate JSON code blocks before publishing. If you intentionally show invalid JSON (annotated with /* comments */), use ```json5 or ```jsonc as the fence label instead.",
    source: "AFDocs v0.3.0 §3.7 (json-code-block-validity)",
    impl: "src/lib/checks/page-checks.ts",
    details: { pageUrl: page.url, total: blocks.length, failures: failures.slice(0, 3) },
    conclusion: `${failures.length}/${blocks.length} JSON blocks invalid`,
  };
}

export function checkMetadataCompleteness(page: PageResult): CheckResult {
  const snippet = page.profiles.snippet;
  if (!snippet?.ok || !snippet.rawArtifact) {
    return {
      id: "metadata-completeness",
      category: "content-quality",
      severity: "info",
      title: "Couldn't evaluate page metadata",
      message: "Snippet profile didn't return.",
      source: "AFDocs v0.3.0 §5.1 (metadata-completeness)",
      impl: "src/lib/checks/page-checks.ts",
      details: { pageUrl: page.url },
      conclusion: "Skipped",
    };
  }
  let parsed: {
    title?: string | null;
    description?: string | null;
    og?: Record<string, string>;
  } = {};
  try {
    parsed = JSON.parse(snippet.rawArtifact) as typeof parsed;
  } catch {
    // ignore
  }
  const hasTitle = !!parsed.title;
  const hasDesc = !!parsed.description;
  const ogCount = parsed.og ? Object.keys(parsed.og).length : 0;
  const score = (hasTitle ? 1 : 0) + (hasDesc ? 1 : 0) + (ogCount >= 2 ? 1 : 0);
  if (score === 3) {
    return {
      id: "metadata-completeness",
      category: "content-quality",
      severity: "pass",
      title: "Page metadata is complete",
      message: `Title, description, and ${ogCount} OG tag(s) are present. Search-snippet readers (ChatGPT Search, Perplexity, You.com) get everything they need to cite this page.`,
      source: "AFDocs v0.3.0 §5.1 (metadata-completeness)",
      impl: "src/lib/checks/page-checks.ts",
      details: { pageUrl: page.url, hasTitle, hasDesc, ogCount },
      conclusion: `Title + description + ${ogCount} OG tags present`,
    };
  }
  const missing: string[] = [];
  if (!hasTitle) missing.push("title");
  if (!hasDesc) missing.push("meta description");
  if (ogCount < 2)
    missing.push("OG tags (need at least og:title + og:description)");
  return {
    id: "metadata-completeness",
    category: "content-quality",
    severity: score === 0 ? "fail" : "warn",
    title: score === 0 ? "Page has no metadata" : "Page metadata is incomplete",
    message: `Missing: ${missing.join(", ")}. Search-snippet readers see only what's in the metadata — anything missing is invisible to ChatGPT Search and Perplexity citations.`,
    fix: 'Add <title>, <meta name="description">, and OG tags (og:title, og:description, og:image) to every doc page.',
    source: "AFDocs v0.3.0 §5.1 (metadata-completeness)",
    impl: "src/lib/checks/page-checks.ts",
    details: { pageUrl: page.url, hasTitle, hasDesc, ogCount },
    conclusion: `Missing: ${missing.join(", ")}`,
  };
}

export function checkHttpStatus(page: PageResult): CheckResult {
  const raw = page.profiles.rawHttp;
  if (!raw) {
    return {
      id: "http-status-codes",
      category: "url-stability",
      severity: "info",
      title: "Couldn't evaluate HTTP status",
      message: "rawHttp profile missing.",
      source: "AFDocs v0.3.0 §6.1 (http-status-codes)",
      impl: "src/lib/checks/page-checks.ts",
      details: { pageUrl: page.url },
      conclusion: "Skipped",
    };
  }
  if (raw.ok) {
    return {
      id: "http-status-codes",
      category: "url-stability",
      severity: "pass",
      title: "Page returns a clean 2xx",
      message:
        "rawHttp fetch succeeded with a 2xx status. Agents trust the response.",
      source: "AFDocs v0.3.0 §6.1 (http-status-codes)",
      impl: "src/lib/checks/page-checks.ts",
      details: { pageUrl: page.url, ok: true },
      conclusion: "2xx status",
    };
  }
  return {
    id: "http-status-codes",
    category: "url-stability",
    severity: "fail",
    title: "Page returned a non-2xx status",
    message: `rawHttp fetch failed: ${raw.reason ?? "unknown"}. If this URL is in your sitemap or llms.txt, fix the link or remove it.`,
    fix: "Either fix the URL so it returns 200 or remove it from your llms.txt and sitemap. Soft-404s (200 + 'not found' body) are also a problem; ensure your error pages actually return 4xx.",
    source: "AFDocs v0.3.0 §6.1 (http-status-codes)",
    impl: "src/lib/checks/page-checks.ts",
    details: { pageUrl: page.url, reason: raw.reason },
    conclusion: `Non-2xx: ${raw.reason ?? "unknown"}`,
  };
}

export function checkTabbedContent(page: PageResult): CheckResult {
  const raw = page.profiles.rawHttp;
  const headless = page.profiles.headless;
  if (!raw?.ok || !headless?.ok) {
    return {
      id: "tabbed-content-serialization",
      category: "content-structure",
      severity: "info",
      title: "Couldn't evaluate tabbed content",
      message: "Need both raw and headless to compare.",
      source: "AFDocs v0.3.0 §3.3 (tabbed-content-serialization)",
      impl: "src/lib/checks/page-checks.ts",
      details: { pageUrl: page.url },
      conclusion: "Skipped",
    };
  }
  const rawHtml = raw.rawArtifact ?? "";
  const headlessHtml = headless.rawArtifact ?? "";
  const tabMarkerRe = /role\s*=\s*["']tab["']/gi;
  const rawTabMarkers = (rawHtml.match(tabMarkerRe) ?? []).length;
  const headlessTabMarkers = (headlessHtml.match(tabMarkerRe) ?? []).length;
  if (headlessTabMarkers === 0) {
    return {
      id: "tabbed-content-serialization",
      category: "content-structure",
      severity: "pass",
      title: "No tabbed content on this page",
      message: "Nothing to check.",
      source: "AFDocs v0.3.0 §3.3 (tabbed-content-serialization)",
      impl: "src/lib/checks/page-checks.ts",
      details: { pageUrl: page.url, headlessTabMarkers: 0 },
      conclusion: "No tabs detected",
    };
  }
  if (rawTabMarkers >= headlessTabMarkers * 0.8) {
    return {
      id: "tabbed-content-serialization",
      category: "content-structure",
      severity: "pass",
      title: "Tab variants are visible without JavaScript",
      message: `Detected ~${headlessTabMarkers} tab markers in headless and ~${rawTabMarkers} in raw HTML. Tabs are server-rendered.`,
      source: "AFDocs v0.3.0 §3.3 (tabbed-content-serialization)",
      impl: "src/lib/checks/page-checks.ts",
      details: { pageUrl: page.url, rawTabMarkers, headlessTabMarkers },
      conclusion: `${rawTabMarkers}/${headlessTabMarkers} tab markers visible without JS`,
    };
  }
  return {
    id: "tabbed-content-serialization",
    category: "content-structure",
    severity: "warn",
    title: "Tabbed content is hidden behind JavaScript",
    message: `Headless found ~${headlessTabMarkers} tab markers but raw HTML only has ~${rawTabMarkers}. Coding agents that don't run JS see at most the first tab variant.`,
    fix: "Render every tab variant in the source HTML (one after another, or via a CSS-only tab pattern). Don't gate variants behind JS click handlers.",
    source: "AFDocs v0.3.0 §3.3 (tabbed-content-serialization)",
    impl: "src/lib/checks/page-checks.ts",
    details: { pageUrl: page.url, rawTabMarkers, headlessTabMarkers },
    conclusion: `Tabs JS-only (raw ${rawTabMarkers} vs headless ${headlessTabMarkers})`,
  };
}

/**
 * Internal-link integrity. Parse <a href> tags from the rawHttp HTML, keep
 * only the same-origin ones, sample up to LINK_SAMPLE_SIZE of them, and
 * HEAD-probe each. A broken link wastes the agent's fetch budget; many
 * agents abandon a page after enough 404s on its outbound links.
 *
 * Async — uses HTTP probes — so the runner has to await runPageChecks.
 */
const LINK_SAMPLE_SIZE = 8;

export async function checkInternalLinkIntegrity(
  page: PageResult,
): Promise<CheckResult> {
  const raw = page.profiles.rawHttp;
  if (!raw?.ok || !raw.rawArtifact) {
    return {
      id: "internal-link-integrity",
      category: "content-structure",
      severity: "info",
      title: "Couldn't evaluate internal links",
      message: "Raw HTTP fetch didn't return HTML.",
      source: "AFDocs v0.3.0 §6.3 (internal-link-integrity)",
      impl: "src/lib/checks/page-checks.ts",
      details: { pageUrl: page.url },
      conclusion: "Skipped (no raw HTML)",
    };
  }

  let pageOrigin: string;
  try {
    pageOrigin = new URL(page.url).origin;
  } catch {
    return {
      id: "internal-link-integrity",
      category: "content-structure",
      severity: "info",
      title: "Couldn't evaluate internal links",
      message: "Page URL didn't parse.",
      source: "AFDocs v0.3.0 §6.3 (internal-link-integrity)",
      impl: "src/lib/checks/page-checks.ts",
      details: { pageUrl: page.url },
      conclusion: "Skipped (URL parse error)",
    };
  }

  const $ = cheerio.load(raw.rawArtifact);
  const candidates = new Set<string>();
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    if (href.startsWith("#")) return; // intra-page anchor
    if (/^(?:mailto:|tel:|javascript:)/i.test(href)) return;
    try {
      const abs = new URL(href, page.url);
      if (abs.origin !== pageOrigin) return; // external
      // Strip the fragment — fragment-only differences aren't worth probing
      abs.hash = "";
      candidates.add(abs.toString());
    } catch {
      // ignore malformed hrefs
    }
  });
  // Don't probe the page itself
  candidates.delete(page.url);
  candidates.delete(page.url.replace(/\/$/, ""));

  const links = Array.from(candidates);
  if (links.length === 0) {
    return {
      id: "internal-link-integrity",
      category: "content-structure",
      severity: "pass",
      title: "No internal links to verify on this page",
      message: "Nothing to check.",
      source: "AFDocs v0.3.0 §6.3 (internal-link-integrity)",
      impl: "src/lib/checks/page-checks.ts",
      details: { pageUrl: page.url, total: 0 },
      conclusion: "No internal links",
    };
  }

  // Sample evenly across the link list — first link, last link, plus
  // evenly-spaced ones in between. This catches both nav links (top of
  // page) and content links (middle/bottom) without doing 100 probes.
  const sample =
    links.length <= LINK_SAMPLE_SIZE
      ? links
      : Array.from({ length: LINK_SAMPLE_SIZE }, (_, i) =>
          links[Math.floor((i / (LINK_SAMPLE_SIZE - 1)) * (links.length - 1))]!,
        );

  const audit: AuditEntry[] = [];
  const broken: string[] = [];
  for (const link of sample) {
    try {
      const res = await headUrl(link);
      audit.push({
        method: "HEAD",
        url: link,
        status: res.statusCode,
      });
      if (res.statusCode === 0 || res.statusCode >= 400) {
        broken.push(link);
      }
    } catch (e) {
      audit.push({
        method: "HEAD",
        url: link,
        status: 0,
        note: e instanceof Error ? e.message : "head failed",
      });
      broken.push(link);
    }
  }

  if (broken.length === 0) {
    return {
      id: "internal-link-integrity",
      category: "content-structure",
      severity: "pass",
      title: "Internal links resolve",
      message: `Sampled ${sample.length} of ${links.length} same-origin links from this page. Every one returned a 2xx/3xx status.`,
      source: "AFDocs v0.3.0 §6.3 (internal-link-integrity)",
      impl: "src/lib/checks/page-checks.ts",
      details: { pageUrl: page.url, sampled: sample.length, total: links.length },
      audit,
      conclusion: `${sample.length}/${sample.length} sampled links resolved`,
    };
  }
  const brokenPct = Math.round((broken.length / sample.length) * 100);
  return {
    id: "internal-link-integrity",
    category: "content-structure",
    severity: brokenPct <= 25 ? "warn" : "fail",
    title:
      brokenPct <= 25
        ? "Some internal links are broken"
        : "Many internal links are broken",
    message: `${broken.length} of ${sample.length} sampled internal links (${brokenPct}%) returned 4xx/5xx or didn't respond. Examples: ${broken.slice(0, 3).join(", ")}.`,
    fix: "Fix the broken URLs or remove them. If you renamed a section, add 301 redirects from the old paths so existing internal links still resolve.",
    source: "AFDocs v0.3.0 §6.3 (internal-link-integrity)",
    impl: "src/lib/checks/page-checks.ts",
    details: { pageUrl: page.url, broken, sampled: sample.length, total: links.length },
    audit,
    conclusion: `${broken.length}/${sample.length} sampled links broken`,
  };
}

/**
 * Run all per-page checks for one page. Returns CheckResult[] tagged with
 * the page url in details.pageUrl. Now async — internal-link-integrity
 * does HTTP probes.
 */
export async function runPageChecks(page: PageResult): Promise<CheckResult[]> {
  const sync = [
    checkRenderingStrategy(page),
    ...checkPageSize(page),
    checkContentStartPosition(page),
    checkHeadingHierarchy(page),
    checkImageAltCoverage(page),
    checkMarkdownCodeFences(page),
    checkJsonCodeBlocks(page),
    checkMetadataCompleteness(page),
    checkHttpStatus(page),
    checkTabbedContent(page),
  ];
  // Internal-link integrity issues a HEAD probe per sampled link, which
  // adds significant wall-clock time on slow hosts. Skip on Vercel where
  // we have a tight function-duration budget; the site-level checks still
  // give a useful read on link health via the discovery crawl.
  if (process.env.VERCEL === "1") {
    return sync;
  }
  const internalLinks = await checkInternalLinkIntegrity(page);
  return [...sync, internalLinks];
}
