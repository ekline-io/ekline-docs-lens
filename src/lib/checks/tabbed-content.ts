import * as cheerio from "cheerio";
import type { CheckResult } from "../types";

export function checkTabbedContent(html: string): CheckResult {
  const $ = cheerio.load(html);
  const selectors = [
    "[role=tabpanel]",
    ".tabs__panel, .tabs-panel, .tab-panel",
    "[data-tab-panel]",
    "mdx-tab-panel, tab-panel",
  ];
  let panelCount = 0;
  let serializedChars = 0;
  for (const sel of selectors) {
    $(sel).each((_, el) => {
      panelCount++;
      serializedChars += $(el).text().replace(/\s+/g, " ").trim().length;
    });
  }

  if (panelCount === 0) {
    return {
      id: "tabbed-content-serialization",
      category: "content-structure",
      severity: "pass",
      title: "You don't have tabbed content for agents to stumble over",
      message: "No tab panels, language switchers, or accordions detected. Agents read your content in the order you intended.",
      source: "AFDocs v0.3.0 §4.1 (tabbed-content-serialization)",
      impl: "server/src/checks/tabbed-content.ts",
    };
  }
  const k = Math.round(serializedChars / 1000);
  if (serializedChars <= 50_000) {
    return {
      id: "tabbed-content-serialization",
      category: "content-structure",
      severity: "pass",
      title: "Your tabs serialize cleanly for agents",
      message: `${panelCount} tab panel${panelCount > 1 ? "s" : ""} flatten to about ${k}K characters when agents read them linearly. That fits within every major agent's budget.`,
      source: "AFDocs v0.3.0 §4.1 (tabbed-content-serialization)",
      impl: "server/src/checks/tabbed-content.ts",
      details: { panelCount, serializedChars },
    };
  }
  if (serializedChars <= 100_000) {
    return {
      id: "tabbed-content-serialization",
      category: "content-structure",
      severity: "warn",
      title: "Agents with tighter budgets miss your later tab variants",
      message: `${panelCount} tab panels serialize to ${k}K characters end-to-end. Agents see them in source order; the last few variants sit beyond where smaller-budget agents stop reading.`,
      fix: "Split tab variants into separate pages, or expose a query-string selector (like ?lang=python) so agents can request the specific variant they need.",
      source: "AFDocs v0.3.0 §4.1 (tabbed-content-serialization)",
      impl: "server/src/checks/tabbed-content.ts",
      details: { panelCount, serializedChars },
    };
  }
  return {
    id: "tabbed-content-serialization",
    category: "content-structure",
    severity: "fail",
    title: "Most of your tab variants are invisible to agents",
    message: `${panelCount} tab panels flatten to ${k}K characters, well past the truncation thresholds. Agents reliably see only the first variant or two; the rest are gone by the time truncation kicks in.`,
    fix: "Break tab variants into separate URLs (e.g., /api/create?lang=python, ?lang=ruby). That way an agent can request exactly the variant it needs without paying for the rest.",
    source: "AFDocs v0.3.0 §4.1 (tabbed-content-serialization)",
    impl: "server/src/checks/tabbed-content.ts",
    details: { panelCount, serializedChars },
  };
}
