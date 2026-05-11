import type { CheckResult } from "../types";

export function checkCodeFences(markdown: string): CheckResult {
  const lines = markdown.split("\n");
  const fenceOpens: { line: number; delimiter: string }[] = [];
  let unclosed = 0;
  const problems: number[] = [];

  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(\s{0,3})(`{3,}|~{3,})/);
    if (!m) continue;
    const delimiter = m[2];
    if (fenceOpens.length === 0) {
      fenceOpens.push({ line: i + 1, delimiter });
    } else {
      const top = fenceOpens[fenceOpens.length - 1];
      if (delimiter[0] === top.delimiter[0] && delimiter.length >= top.delimiter.length) {
        fenceOpens.pop();
      } else {
        fenceOpens.push({ line: i + 1, delimiter });
      }
    }
  }
  for (const f of fenceOpens) {
    unclosed++;
    problems.push(f.line);
  }

  if (unclosed === 0) {
    return {
      id: "markdown-code-fence-validity",
      category: "content-structure",
      severity: "pass",
      title: "Your code examples render correctly for agents",
      message: "Every code fence in your converted markdown has a matching close. Agents see code as code and prose as prose.",
      source: "AFDocs v0.3.0 §4.3 · CommonMark",
      impl: "server/src/checks/code-fences.ts",
    };
  }
  return {
    id: "markdown-code-fence-validity",
    category: "content-structure",
    severity: "fail",
    title: "An unclosed code fence is hiding part of your content from agents",
    message: `${unclosed} unclosed code fence${unclosed > 1 ? "s" : ""} found at line${unclosed > 1 ? "s" : ""} ${problems.join(", ")}. Once a code fence opens and never closes, every line after it gets interpreted as code by the agent, your prose, headings, and links become literal content to reproduce instead of instructions to follow.`,
    fix: "Find the opening ``` or ~~~ that never closed. Make sure every opening delimiter has a matching close of equal or greater length.",
    source: "AFDocs v0.3.0 §4.3 · CommonMark",
    impl: "server/src/checks/code-fences.ts",
    details: { unclosed, lines: problems },
  };
}
