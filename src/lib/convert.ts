import TurndownService from "turndown";
import * as cheerio from "cheerio";

const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  bulletListMarker: "-",
});

turndown.remove(["script", "noscript", "iframe"]);
turndown.addRule("drop-svg", {
  filter: (node) => node.nodeName === "SVG",
  replacement: () => "",
});

export function htmlToMarkdown(html: string): string {
  const $ = cheerio.load(html);
  $("script, noscript").remove();
  return turndown.turndown($.html());
}

export function stripToContentBody(html: string): string {
  const $ = cheerio.load(html);
  $("script, style, noscript, nav, header, footer").remove();
  const main = $("main, article, [role=main]").first();
  return (main.length ? main.html() : $("body").html()) ?? "";
}

export function contentStartPct(markdown: string): number {
  if (!markdown.length) return 100;
  const m = markdown.match(/^(#\s|##\s|[A-Za-z0-9].{40,})/m);
  if (!m || m.index === undefined) return 100;
  return Math.round((m.index / markdown.length) * 100);
}

export function textToMarkupRatio(html: string): number {
  const $ = cheerio.load(html);
  $("script, style, noscript").remove();
  const text = $("body").text().replace(/\s+/g, " ").trim();
  const textLen = text.length;
  const htmlLen = html.length;
  if (!htmlLen) return 0;
  return Math.round((textLen / htmlLen) * 100) / 100;
}
