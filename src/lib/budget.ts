import * as cheerio from "cheerio";

export interface ContentBudget {
  totalBytes: number;
  segments: {
    label: string;
    color: string;
    bytes: number;
    pct: number;
  }[];
}

/**
 * Partition HTML response into non-overlapping byte buckets.
 * Guarantee: segment bytes sum to <= totalBytes.
 */
export function computeContentBudget(html: string): ContentBudget {
  const total = Buffer.byteLength(html, "utf8");

  // Bucket 1, scripts. Measure, then remove.
  const $1 = cheerio.load(html);
  const scriptBytes = sumSerialized($1, $1("script").toArray());
  $1("script").remove();

  // Bucket 2, styles (both <style> and style="").
  const inlineStyleBytes = sumSerialized($1, $1("style").toArray());
  $1("style").remove();
  const styleAttrBytes = sumStrings(
    $1("[style]").map((_, el) => ($1(el).attr("style") ?? "")).toArray(),
  );

  // Bucket 3, svg.
  const svgBytes = sumSerialized($1, $1("svg").toArray());
  $1("svg, noscript").remove();

  // Bucket 4, nav/header/footer (after script/style/svg stripped).
  const navBytes = sumSerialized($1, $1("nav, header, footer").toArray());
  $1("nav, header, footer").remove();

  // Bucket 5, main/article (or remaining body if none).
  const main = $1("main, article, [role=main]").first();
  const contentBytes = Buffer.byteLength(
    main.length ? main.html() ?? "" : $1("body").html() ?? "",
    "utf8",
  );

  const raw = [
    { label: "inline JS", color: "#a855f7", bytes: scriptBytes },
    { label: "inline CSS", color: "#f59e0b", bytes: inlineStyleBytes + styleAttrBytes },
    { label: "SVG", color: "#ec4899", bytes: svgBytes },
    { label: "nav/header/footer", color: "#64748b", bytes: navBytes },
    { label: "content", color: "#10b981", bytes: contentBytes },
  ];

  // Normalize: cheerio serialization can double-count when boilerplate nests inside
  // nav. Scale buckets down proportionally so sum never exceeds totalBytes, then
  // fill any remainder with "other markup".
  const counted = raw.reduce((s, r) => s + r.bytes, 0);
  let normalized = raw;
  if (counted > total) {
    const scale = total / counted;
    normalized = raw.map((r) => ({ ...r, bytes: Math.round(r.bytes * scale) }));
  }
  const finalCounted = normalized.reduce((s, r) => s + r.bytes, 0);
  const other = Math.max(0, total - finalCounted);

  const segments = [
    ...normalized,
    { label: "other markup", color: "#94a3b8", bytes: other },
  ]
    .filter((s) => s.bytes > 0)
    .map((s) => ({
      ...s,
      pct: Math.round((s.bytes / total) * 1000) / 10,
    }));

  return { totalBytes: total, segments };
}

function sumSerialized($: cheerio.CheerioAPI, nodes: unknown[]): number {
  let total = 0;
  for (const n of nodes) {
    total += Buffer.byteLength($.html(n as never), "utf8");
  }
  return total;
}

function sumStrings(strings: string[]): number {
  let total = 0;
  for (const s of strings) total += Buffer.byteLength(s, "utf8");
  return total;
}
