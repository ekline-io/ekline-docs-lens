import * as cheerio from "cheerio";
import { headUrl } from "../fetch";
import type { AuditEntry, CheckResult } from "../types";
import type { PageResult } from "@/lib/core/run-types";

/**
 * Per-page Docs Lens checks. The afdocs sub-runner covers the AFDocs Spec
 * page-level checks (rendering-strategy, page-size, content-start-position,
 * markdown-code-fence-validity, tabbed-content-serialization, http-status-
 * codes); the checks below cover the ground afdocs doesn't.
 *
 * Each returned CheckResult is for THIS page; aggregatePageChecks rolls
 * them up into a single site-level CheckResult per check id.
 */

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
    if (href.startsWith("#")) return;
    if (/^(?:mailto:|tel:|javascript:)/i.test(href)) return;
    try {
      const abs = new URL(href, page.url);
      if (abs.origin !== pageOrigin) return;
      abs.hash = "";
      candidates.add(abs.toString());
    } catch {
      // ignore malformed hrefs
    }
  });
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

  // Sample evenly across the link list — catches both nav links (top of
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
      audit.push({ method: "HEAD", url: link, status: res.statusCode });
      if (res.statusCode === 0 || res.statusCode >= 400) broken.push(link);
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
 * Run all per-page Docs Lens checks. afdocs's page-level checks run in
 * parallel via its own sub-runner. Internal-link integrity hits HEAD probes
 * which add wall-clock time on slow hosts; skip on Vercel where we have a
 * tight function-duration budget.
 */
export async function runPageChecks(page: PageResult): Promise<CheckResult[]> {
  const sync = [
    checkHeadingHierarchy(page),
    checkImageAltCoverage(page),
    checkJsonCodeBlocks(page),
    checkMetadataCompleteness(page),
  ];
  if (process.env.VERCEL === "1") return sync;
  const internalLinks = await checkInternalLinkIntegrity(page);
  return [...sync, internalLinks];
}
