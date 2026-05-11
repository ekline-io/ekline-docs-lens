import * as cheerio from "cheerio";
import type { CheckResult } from "../types";

export function checkHeadingHierarchy(html: string): CheckResult {
  const $ = cheerio.load(html);
  $("script, style, noscript, nav, header, footer").remove();
  const levels: number[] = [];
  $("h1, h2, h3, h4, h5, h6").each((_, el) => {
    const n = parseInt((el as unknown as { tagName: string }).tagName.slice(1), 10);
    levels.push(n);
  });
  const h1Count = levels.filter((l) => l === 1).length;
  const skips: string[] = [];
  for (let i = 1; i < levels.length; i++) {
    if (levels[i] > levels[i - 1] + 1) {
      skips.push(`h${levels[i - 1]} → h${levels[i]}`);
    }
  }
  if (h1Count === 1 && skips.length === 0) {
    return {
      id: "heading-hierarchy",
      category: "content-structure",
      severity: "pass",
      title: "Agents can map the structure of this page",
      message: `One clear h1, ${levels.length} headings total, no skipped levels. Agents and RAG chunkers use this structure to identify section boundaries reliably.`,
      source: "docs-lens · document semantics",
      impl: "server/src/checks/extras.ts",
    };
  }
  const issues: string[] = [];
  if (h1Count === 0) issues.push("no h1");
  if (h1Count > 1) issues.push(`${h1Count} h1s instead of one`);
  if (skips.length) issues.push(`levels skip (${skips.join(", ")})`);
  return {
    id: "heading-hierarchy",
    category: "content-structure",
    severity: h1Count === 0 ? "fail" : "warn",
    title: "Your heading structure is hard for agents to parse",
    message: `This page has ${issues.join("; ")}. Agents building a mental map of your document, and RAG pipelines chunking by section, struggle when the structure is ambiguous.`,
    fix: "Use exactly one h1 per page (the page title), and don't skip heading levels. An h3 should live inside an h2, not directly under an h1.",
    source: "docs-lens · document semantics",
    impl: "server/src/checks/extras.ts",
    details: { h1Count, skips, levels },
  };
}

export function checkImageAlt(html: string): CheckResult {
  const $ = cheerio.load(html);
  $("script, style, noscript, nav, header, footer").remove();
  const images = $("img").toArray();
  if (images.length === 0) {
    return {
      id: "image-alt-coverage",
      category: "content-structure",
      severity: "info",
      title: "No images in your content area",
      message: "Nothing to check.",
      source: "docs-lens · accessibility",
      impl: "server/src/checks/extras.ts",
    };
  }
  const missing = images.filter((el) => {
    const alt = $(el).attr("alt");
    return !alt || alt.trim().length < 2;
  }).length;
  if (missing === 0) {
    return {
      id: "image-alt-coverage",
      category: "content-structure",
      severity: "pass",
      title: "Your diagrams and screenshots have text for agents to read",
      message: `All ${images.length} images carry meaningful alt text. Agents and screen readers understand what each image is showing.`,
      source: "docs-lens · accessibility",
      impl: "server/src/checks/extras.ts",
    };
  }
  const ratio = missing / images.length;
  const sev = ratio > 0.5 ? "fail" : "warn";
  return {
    id: "image-alt-coverage",
    category: "content-structure",
    severity: sev,
    title: "Agents are blind to some of your diagrams",
    message: `${missing} of ${images.length} images on this page have no alt text. Architecture diagrams, UI screenshots, and flowcharts without alt text are invisible to agents, they see an image tag with no content.`,
    fix: "Add descriptive alt attributes to every informative image. For purely decorative images, use alt=\"\" explicitly so agents know to skip them.",
    source: "docs-lens · accessibility",
    impl: "server/src/checks/extras.ts",
    details: { missing, total: images.length },
  };
}

export function checkMetadata(html: string): CheckResult {
  const $ = cheerio.load(html);
  const title = $("head title").text().trim();
  const desc = $("head meta[name=description]").attr("content")?.trim() ?? "";
  const canonical = $("head link[rel=canonical]").attr("href")?.trim() ?? "";
  const ogTitle = $("head meta[property='og:title']").attr("content")?.trim() ?? "";
  const missing: string[] = [];
  if (!title || title.length < 4) missing.push("<title>");
  if (!desc) missing.push("meta description");
  if (!canonical) missing.push("canonical URL");
  if (!ogTitle) missing.push("og:title");

  if (missing.length === 0) {
    return {
      id: "metadata-completeness",
      category: "discoverability",
      severity: "pass",
      title: "Answer engines have what they need to cite this page",
      message: "Title, description, canonical URL, and Open Graph tags are all present. Perplexity, ChatGPT Search, and Google AI Overviews use these to decide how to summarize and attribute your content.",
      source: "docs-lens · web metadata",
      impl: "server/src/checks/extras.ts",
    };
  }
  return {
    id: "metadata-completeness",
    category: "discoverability",
    severity: missing.length >= 3 ? "fail" : "warn",
    title: "Answer engines have to guess how to describe this page",
    message: `Your page is missing ${missing.join(", ")}. When Perplexity or ChatGPT Search cites you, they extract the title and description from the first rendered heading or paragraph, which is often a navigation element, not an accurate page summary.`,
    fix: "Make sure every page has a <title>, a descriptive meta description (~150 chars), a link rel=canonical, and an og:title. These four tags carry most of the weight for GEO.",
    source: "docs-lens · web metadata",
    impl: "server/src/checks/extras.ts",
    details: { title, desc, canonical, ogTitle, missing },
  };
}

export function checkJsonCodeBlocks(markdown: string): CheckResult {
  const blocks = [...markdown.matchAll(/```(json|yaml)\n([\s\S]*?)```/g)];
  if (blocks.length === 0) {
    return {
      id: "json-code-block-validity",
      category: "content-structure",
      severity: "info",
      title: "No JSON or YAML blocks on this page to validate",
      message: "Nothing to check.",
      source: "docs-lens · code block integrity",
      impl: "server/src/checks/extras.ts",
    };
  }
  const broken: { lang: string; err: string }[] = [];
  for (const block of blocks) {
    const lang = block[1];
    const body = block[2];
    if (lang === "json") {
      try {
        JSON.parse(body);
      } catch (e) {
        broken.push({ lang, err: (e as Error).message.slice(0, 100) });
      }
    }
  }
  if (broken.length === 0) {
    return {
      id: "json-code-block-validity",
      category: "content-structure",
      severity: "pass",
      title: "Your JSON examples are valid as written",
      message: `All ${blocks.length} JSON/YAML blocks on this page parse cleanly. Developers (and agents generating code from your examples) can copy them straight into their projects.`,
      source: "docs-lens · code block integrity",
      impl: "server/src/checks/extras.ts",
    };
  }
  return {
    id: "json-code-block-validity",
    category: "content-structure",
    severity: "warn",
    title: "Some of your code examples won't parse",
    message: `${broken.length} of ${blocks.length} JSON blocks on this page fail to parse. Agents copy these examples verbatim into generated code, invalid JSON here produces runtime errors in your users' projects.`,
    fix: "Lint JSON blocks on build. Every ```json fenced block should round-trip through JSON.parse without error.",
    source: "docs-lens · code block integrity",
    impl: "server/src/checks/extras.ts",
    details: { broken, total: blocks.length },
  };
}
