interface Props {
  siteName: string;
  score: number;
  grade: string;
  /** Total check ids that exist in our rubric. Constant ~30. */
  totalChecks: number;
  /** Checks that actually ran and returned an applicable verdict (pass/warn/fail). */
  applicableChecks: number;
  /** Checks that ran but returned "info" — probed for something not present on this site. */
  inapplicableChecks: number;
  failCount: number;
  warnCount: number;
  pagesScanned: number;
}

/**
 * Auto-generated synthesis for the scan summary header. Two-number framing:
 *  - Score (headline): based on fail/warn count, info doesn't penalize.
 *  - Audit completeness: how thorough the scan was (applicable / total).
 *
 * The point is to make the score honest — a 95/100 grade with only 12 of 30
 * checks running is a different statement than 95/100 with all 30.
 */
export function ExecutiveSummary({
  siteName,
  score,
  grade,
  totalChecks,
  applicableChecks,
  inapplicableChecks,
  failCount,
  warnCount,
  pagesScanned,
}: Props) {
  const passing = Math.max(0, applicableChecks - failCount - warnCount);
  const passingPct = applicableChecks > 0 ? Math.round((passing / applicableChecks) * 100) : 100;
  const issues = failCount + warnCount;
  const verdict =
    issues === 0
      ? "is broadly accessible to AI agents with no obvious blockers."
      : issues <= 2
        ? "is broadly accessible to AI agents with a small number of fixable gaps."
        : issues <= 5
          ? `has ${issues} areas that should be addressed before agents get a clean read.`
          : `has ${issues} areas that materially hurt agent retrieval. Worth fixing in order of severity.`;

  return (
    <section className="px-6 py-8 border-b border-rule">
      <div className="max-w-[1100px] mx-auto">
        <div className="flex items-baseline gap-3 mb-3">
          <span className="text-[10.5px] uppercase tracking-[0.12em] text-ink/45 mono">
            EXECUTIVE SUMMARY
          </span>
        </div>
        <p className="text-[15px] md:text-[16px] text-ink/80 leading-[1.7] max-w-3xl mb-6">
          <strong className="text-ink h-navy">{siteName}</strong> scores{" "}
          <strong className="text-ink">{score}/100 (Grade {grade})</strong>, passing{" "}
          <strong className="text-ink">{passing} of {applicableChecks} applicable checks ({passingPct}%)</strong>{" "}
          across <strong className="text-ink">{pagesScanned} sampled page{pagesScanned === 1 ? "" : "s"}</strong>.
          The documentation {verdict}
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 max-w-3xl">
          <StatTile
            label="AUDIT SURFACE"
            value={`${totalChecks}`}
            sub="checks in rubric"
          />
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
          <StatTile
            label="GRADE"
            value={grade}
            sub={`${score} / 100`}
            tone="grade"
          />
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
    <div className="border border-rule rounded-lg p-3 bg-paper-dim/30">
      <div className="text-[10px] uppercase tracking-[0.12em] text-ink/45 mono mb-1">
        {label}
      </div>
      <div className={`text-[24px] md:text-[28px] font-bold leading-none ${valueClass}`}>
        {value}
      </div>
      <div className="text-[11px] text-ink/55 mt-1.5">{sub}</div>
    </div>
  );
}
