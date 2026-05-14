import type { ProfileId } from "@/lib/core/types";
import { bandFor, BAND_CLASSES, type Band } from "@/lib/band";

type Status = "good" | "partial" | "broken";

const PROFILE_LABELS: Record<ProfileId, string> = {
  rawHttp: "Raw HTTP fetchers",
  headless: "Headless browsers",
  snippet: "Search snippets",
};

interface Props {
  perProfile: Record<ProfileId, Status>;
  siteName: string;
  rootUrl: string;
  score: number;
  grade: string;
  totalChecks: number;
  applicableChecks: number;
  inapplicableChecks: number;
  failCount: number;
  warnCount: number;
  pagesScanned: number;
  discoverySource?: string;
  capped?: boolean;
}


/**
 * Result hero. Three jobs:
 *   1. Name what each reader profile saw (verdict sentence — the headline).
 *   2. State what to do (status band — the action).
 *   3. Carry the shareable handle (grade pill — small, tucked into the eyebrow).
 *
 * Score math used to live in the executive paragraph. We moved it because the
 * grade is a shareability handle, not the headline — see /methodology.
 */
export function ResultHero({
  perProfile,
  siteName,
  rootUrl,
  score,
  grade,
  applicableChecks,
  failCount,
  warnCount,
  pagesScanned,
  discoverySource,
  capped,
}: Props) {
  const sentence = buildSentence(perProfile);
  const issues = failCount + warnCount;
  const band = bandFor(failCount, warnCount);
  const contextLine =
    issues === 0
      ? `Across ${pagesScanned} sampled page${pagesScanned === 1 ? "" : "s"}, no agent-blocking issues turned up.`
      : `Across ${pagesScanned} sampled page${pagesScanned === 1 ? "" : "s"}, ${issues} ${issues === 1 ? "area needs" : "areas need"} attention. The agent-fix prompt below handles ${issues === 1 ? "it" : "them"} in one pass.`;

  return (
    <section className="px-6 py-10 border-b border-rule bg-gradient-to-br from-paper-tint/40 via-paper to-paper">
      <div className="max-w-[1100px] mx-auto">
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <div className="inline-flex items-center gap-2">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-accent" />
            <span className="text-[10.5px] uppercase tracking-[0.12em] text-ink/50 mono">
              VERDICT · {rootUrl}
            </span>
          </div>
          <GradePill grade={grade} score={score} />
        </div>
        <h2 className="h-display h-navy text-[26px] md:text-[36px] leading-[1.1] max-w-3xl mb-5">
          {sentence}
        </h2>
        <p className="text-[15px] md:text-[16px] text-ink/75 leading-[1.7] max-w-3xl mb-8">
          {siteName ? <strong className="text-ink">{siteName}</strong> : null}
          {siteName ? " — " : null}
          {contextLine}
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-3xl">
          <StatusTile band={band} />
          <StatTile
            label="ISSUES"
            value={`${issues}`}
            sub={
              issues === 0
                ? `0 of ${applicableChecks} applicable`
                : `${failCount} fail · ${warnCount} warn`
            }
            tone={issues > 0 ? "alert" : "ok"}
          />
          <StatTile
            label="PAGES"
            value={`${pagesScanned}`}
            sub={
              discoverySource
                ? `via ${discoverySource}${capped ? " · capped" : ""}`
                : "sampled"
            }
          />
        </div>
      </div>
    </section>
  );
}

function GradePill({ grade, score }: { grade: string; score: number }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border border-rule bg-white px-2.5 py-1 text-[10.5px] mono text-ink/60"
      title={`Shareability handle — see /methodology for how this is computed`}
    >
      <span className="text-ink/45">grade</span>
      <span className="font-bold text-ink">{grade}</span>
      <span className="text-ink/30">·</span>
      <span className="tabular-nums">{score}/100</span>
    </span>
  );
}

function StatusTile({ band }: { band: Band }) {
  const classes = BAND_CLASSES[band.tone];
  return (
    <div className={`border rounded-lg p-3 ${classes.tile}`}>
      <div className="text-[10px] uppercase tracking-[0.12em] text-ink/45 mono mb-1">
        STATUS
      </div>
      <div className={`text-[18px] md:text-[22px] font-bold leading-tight ${classes.valueText}`}>
        {band.label}
      </div>
      <div className="text-[11px] text-ink/55 mt-1.5">based on issue count and severity</div>
    </div>
  );
}

function StatTile({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: string;
  sub: string;
  tone?: "neutral" | "ok" | "alert";
}) {
  const valueClass =
    tone === "alert"
      ? "text-[color:var(--color-fail-ring)]"
      : tone === "ok"
        ? "text-emerald-700"
        : "text-ink";
  return (
    <div className="border border-rule rounded-lg p-3 bg-white">
      <div className="text-[10px] uppercase tracking-[0.12em] text-ink/45 mono mb-1">
        {label}
      </div>
      <div className={`text-[24px] md:text-[30px] font-bold leading-none ${valueClass}`}>
        {value}
      </div>
      <div className="text-[11px] text-ink/55 mt-1.5">{sub}</div>
    </div>
  );
}

function buildSentence(perProfile: Record<ProfileId, Status>): string {
  const phrase = (id: ProfileId, s: Status): string => {
    const subj = PROFILE_LABELS[id];
    if (s === "good") return `${subj} get all your content`;
    if (s === "partial") return `${subj} miss part of it`;
    return `${subj} can't read it at all`;
  };
  const parts = (Object.entries(perProfile) as [ProfileId, Status][]).map(([id, s]) =>
    phrase(id, s),
  );
  if (parts.length === 0) return "Scanning your site…";
  if (parts.length === 1) return `${capitalize(parts[0]!)}.`;
  return `${capitalize(parts[0]!)}. ${parts.slice(1).map(capitalize).join(". ")}.`;
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0]!.toUpperCase() + s.slice(1);
}
