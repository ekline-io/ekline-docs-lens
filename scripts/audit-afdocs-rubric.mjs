#!/usr/bin/env node
/**
 * Audit drift between our rubric and afdocs's.
 *
 * The methodology page promises that the visitor can "re-run any number we
 * show" via `npx afdocs check`. That promise only holds if afdocs's check
 * inventory and ours stay aligned. This script surfaces the actual diff
 * (afdocs-only / ours-only / common) so we can either pin to a known-good
 * afdocs version, soften the copy, or harmonize check IDs.
 *
 * Run: `node scripts/audit-afdocs-rubric.mjs [--json]`
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getAllChecks } from "afdocs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const COPY_FILE = path.join(REPO_ROOT, "src/lib/fix/check-fix-copy.ts");

const afdocsVersion = JSON.parse(
  fs.readFileSync(path.join(REPO_ROOT, "node_modules/afdocs/package.json"), "utf8"),
).version;

function readOurChecks() {
  const src = fs.readFileSync(COPY_FILE, "utf8");
  // Match every keyed entry; capture optional title field on the next line.
  // Format A (post-PR#5): `"<id>": { title: "...", short: ..., long: ... }`
  // Format B (pre-PR#5):  `"<id>": { short: ..., long: ... }`
  const re = /"([a-z][a-z0-9-]+)":\s*\{([^}]{0,80})/g;
  const out = [];
  const seen = new Set();
  let m;
  while ((m = re.exec(src)) !== null) {
    const id = m[1];
    if (seen.has(id)) continue;
    seen.add(id);
    const head = m[2];
    const titleMatch = head.match(/title:\s*"([^"]+)"/);
    out.push({ id, title: titleMatch ? titleMatch[1] : id });
  }
  return out;
}

function readAfdocsChecks() {
  return getAllChecks().map((c) => ({
    id: c.id,
    category: c.category,
    description: c.description ?? "",
  }));
}

function main() {
  const ours = readOurChecks();
  const theirs = readAfdocsChecks();
  const ourIds = new Set(ours.map((c) => c.id));
  const theirIds = new Set(theirs.map((c) => c.id));

  const onlyOurs = ours.filter((c) => !theirIds.has(c.id));
  const onlyTheirs = theirs.filter((c) => !ourIds.has(c.id));
  const common = ours.filter((c) => theirIds.has(c.id));

  if (process.argv.includes("--json")) {
    console.log(
      JSON.stringify(
        {
          afdocsVersion,
          totals: { ours: ours.length, theirs: theirs.length, common: common.length },
          onlyOurs,
          onlyTheirs,
          common,
        },
        null,
        2,
      ),
    );
    return;
  }

  const lines = [];
  lines.push(`# Rubric alignment audit — Docs Lens vs afdocs@${afdocsVersion}`);
  lines.push("");
  lines.push(
    `**Docs Lens checks**: ${ours.length} · **afdocs checks**: ${theirs.length} · **shared IDs**: ${common.length}`,
  );
  lines.push("");

  lines.push(`## Only in Docs Lens (${onlyOurs.length})`);
  lines.push("");
  lines.push("Checks afdocs does not run. If the visitor follows our methodology page and runs afdocs locally, they will get no signal on these.");
  lines.push("");
  for (const c of onlyOurs) lines.push(`- \`${c.id}\` — ${c.title}`);
  lines.push("");

  lines.push(`## Only in afdocs (${onlyTheirs.length})`);
  lines.push("");
  lines.push("Checks afdocs runs that Docs Lens does not. The visitor will see *new* findings if they run afdocs.");
  lines.push("");
  for (const c of onlyTheirs) {
    lines.push(`- \`${c.id}\` — ${c.description || "(no description)"} _[${c.category}]_`);
  }
  lines.push("");

  lines.push(`## Shared IDs (${common.length})`);
  lines.push("");
  lines.push("Same check ID on both sides. Severity, rubric logic, and thresholds may still diverge — this audit only compares IDs.");
  lines.push("");
  for (const c of common) lines.push(`- \`${c.id}\` — ${c.title}`);

  console.log(lines.join("\n"));
}

main();
