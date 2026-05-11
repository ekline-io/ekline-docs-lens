import type { ProfileId } from "@/lib/core/types";

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
}

/**
 * Single hero block for the scan summary. Combines the one-sentence verdict
 * and the audit stats into one section instead of stacking them as two
 * near-redundant blocks.
 *
 * Top: VERDICT eyebrow + sentence + executive paragraph.
 * Bottom: 4 stat tiles (AUDIT SURFACE / APPLICABLE / ISSUES / GRADE).
 */
export function ResultHero({
  perProfile,
  siteName,
  rootUrl,
  score,
  grade,
  totalChecks,
  applicableChecks,
  inapplicableChecks,
  failCount,
  warnCount,
  pagesScanned,
}: Props) {
  const sentence = buildSentence(perProfile);
  const passing = Math.max(0, applicableChecks - failCount - warnCount);
  const passingPct = applicableChecks > 0 ? Math.round((passing / applicableChecks) * 100) : 100;
  const issues = failCount + warnCount;
  const verdictTail =
    issues === 0
      ? "is broadly accessible to AI agents with no obvious blockers."
      : issues <= 2
        ? "is broadly accessible to AI agents with a small number of fixable gaps."
        : issues <= 5
          ? `has ${issues} areas that should be addressed before agents get a clean read.`
          : `has ${issues} areas that materially hurt agent retrieval. Worth fixing in order of severity.`;

  return (
    <section className="px-6 py-10 border-b border-rule bg-gradient-to-br from-paper-tint/40 via-paper to-paper">
      <div className="max-w-[1100px] mx-auto">
        <div className="inline-flex items-center gap-2 mb-4">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-accent" />
          <span className="text-[10.5px] uppercase tracking-[0.12em] text-ink/50 mono">
            VERDICT · {rootUrl}
          </span>
        </div>
        <h2 className="h-display h-navy text-[26px] md:text-[36px] leading-[1.1] max-w-3xl mb-5">
          {sentence}
        </h2>
        <p className="text-[15px] md:text-[16px] text-ink/75 leading-[1.7] max-w-3xl mb-8">
          <strong className="text-ink">{siteName}</strong> scores{" "}
          <strong className="text-ink">{score}/100 (Grade {grade})</strong>, passing{" "}
          <strong className="text-ink">
            {passing} of {applicableChecks} applicable checks ({passingPct}%)
          </strong>{" "}
          across{" "}
          <strong className="text-ink">
            {pagesScanned} sampled page{pagesScanned === 1 ? "" : "s"}
          </strong>
          . The documentation {verdictTail}
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 max-w-3xl">
          <StatTile label="AUDIT SURFACE" value={`${totalChecks}`} sub="checks in rubric" />
          <StatTile
            label="APPLICABLE"
            value={`${applicableChecks}`}
            sub={`${inapplicableChecks} not applicable`}
          />
          <StatTile
            label="ISSUES"
            value={`${issues}`}
            sub={`${failCount} fail · ${warnCount} warn`}
            tone={issues > 0 ? "alert" : "ok"}
          />
          <StatTile label="GRADE" value={grade} sub={`${score} / 100`} tone="grade" />
        </div>
      </div>
    </section>
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
  tone?: "neutral" | "ok" | "alert" | "grade";
}) {
  const valueClass =
    tone === "alert"
      ? "text-[color:var(--color-fail-ring)]"
      : tone === "ok"
        ? "text-emerald-700"
        : tone === "grade"
          ? "h-navy"
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
