import * as cheerio from "cheerio";
import type { CheckResult } from "../types";

const SPA_MARKERS = [
  { selector: "#___gatsby", framework: "Gatsby" },
  { selector: "#__next", framework: "Next.js" },
  { selector: "#__nuxt", framework: "Nuxt" },
  { selector: "#app", framework: "Vue or SvelteKit" },
  { selector: "#root", framework: "React (likely client-rendered)" },
];

export function checkRendering(html: string): CheckResult {
  const $ = cheerio.load(html);
  $("script, style, noscript").remove();

  const bodyText = $("body").text().replace(/\s+/g, " ").trim();
  const headingCount = $("h1, h2, h3").length;
  const paragraphCount = $("p").filter((_, el) => ($(el).text().trim().length ?? 0) > 40).length;
  const codeBlockCount = $("pre, code").length;
  const signals = headingCount + paragraphCount + codeBlockCount;
  const marker = SPA_MARKERS.find((m) => $(m.selector).length > 0);

  if (signals >= 5 && bodyText.length > 2000) {
    return {
      id: "rendering-strategy",
      category: "page-size",
      severity: "pass",
      title: "Your content is in the server response, where agents can see it",
      message: `${headingCount} headings, ${paragraphCount} paragraphs, and ${codeBlockCount} code blocks are already present in the HTML before any JavaScript runs.${marker ? ` Your ${marker.framework} setup server-renders this page.` : ""}`,
      source: "AFDocs v0.3.0 §3.1 (rendering-strategy)",
      impl: "server/src/checks/rendering.ts",
      details: { headingCount, paragraphCount, codeBlockCount, bodyTextLen: bodyText.length, framework: marker?.framework },
    };
  }

  if (marker && signals < 3 && bodyText.length < 500) {
    return {
      id: "rendering-strategy",
      category: "page-size",
      severity: "fail",
      title: "Agents receive an empty shell, not your documentation",
      message: `The HTML response is a ${marker.framework} app shell, the actual content renders client-side after JavaScript executes. Coding agents do not run JavaScript, so they receive an empty container and none of your documentation.`,
      fix: `Enable server-side rendering or static generation for your documentation pages. In ${marker.framework}, this is typically a single configuration change.`,
      source: "AFDocs v0.3.0 §3.1 (rendering-strategy)",
      impl: "server/src/checks/rendering.ts",
      details: { framework: marker.framework, bodyTextLen: bodyText.length, signals },
    };
  }

  return {
    id: "rendering-strategy",
    category: "page-size",
    severity: "warn",
    title: "Part of your content may be JavaScript-rendered",
    message: `Only ${signals} substantive content elements and ${bodyText.length} characters of body text are in the HTML response. Some pieces of this page may hydrate client-side, which agents will miss.`,
    fix: "Verify your key documentation content is in the server response itself, not injected after hydration. Tabs, language selectors, and lazy-loaded sections are common culprits.",
    source: "AFDocs v0.3.0 §3.1 (rendering-strategy)",
    impl: "server/src/checks/rendering.ts",
    details: { signals, bodyTextLen: bodyText.length, framework: marker?.framework },
  };
}
