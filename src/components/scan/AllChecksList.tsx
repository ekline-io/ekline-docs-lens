"use client";

import { useMemo, useState } from "react";
import type { AuditEntry, CheckResult, Severity } from "@/lib/types";
import { axisOf, type Axis } from "@/lib/types";

interface Props {
  checks: CheckResult[];
}

type AxisFilter = Axis | "all";
type SeverityFilter = Severity | "all";

const AXIS_LABELS: Record<Axis, { title: string; subtitle: string }> = {
  agent: {
    title: "Agent retrieval",
    subtitle:
      "How well coding agents (Claude Code, Cursor, Continue) can read this site.",
  },
  geo: {
    title: "Generative engine",
    subtitle:
      "How answer engines (ChatGPT Search, Perplexity, You.com) surface this site.",
  },
  context: {
    title: "Context management",
    subtitle:
      "How efficiently this site fits into an agent's context window per page.",
  },
};

const AXIS_ORDER: Axis[] = ["agent", "geo", "context"];

const SEVERITY_STYLE: Record<Severity, { dot: string; pill: string; label: string }> = {
  fail: {
    dot: "bg-rose-500",
    pill: "bg-fail-bg text-[color:var(--color-fail-ring)] border-[color:var(--color-fail-ring)]/30",
    label: "fail",
  },
  warn: {
    dot: "bg-amber-500",
    pill: "bg-warn-bg text-[color:var(--color-warn-ring)] border-[color:var(--color-warn-ring)]/40",
    label: "warn",
  },
  pass: {
    dot: "bg-emerald-500",
    pill: "bg-pass-bg text-[color:var(--color-pass-ring)] border-[color:var(--color-pass-ring)]/30",
    label: "pass",
  },
  info: {
    dot: "bg-sky-500",
    pill: "bg-paper-dim text-ink/55 border-rule",
    label: "info",
  },
};

const SEVERITY_ORDER: Record<Severity, number> = { fail: 0, warn: 1, pass: 2, info: 3 };

/**
 * Single unified check list. Tabs by strategic axis (Agent retrieval / GEO /
 * Context). Severity filter pills inside each tab. Compact rows (severity
 * pill + check id + title + one-line conclusion). Click any row to expand a
 * terminal-style audit trail of the literal HTTP probes the check ran.
 *
 * Replaces both the previous flat AllChecksList and the separate FixList —
 * the data is the same, the UX is one place.
 */
export function AllChecksList({ checks }: Props) {
  const [activeAxis, setActiveAxis] = useState<AxisFilter>("all");
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>("fail");

  const byAxis = useMemo(() => groupByAxis(checks), [checks]);
  const inAxis = useMemo(
    () => (activeAxis === "all" ? checks : byAxis[activeAxis] ?? []),
    [byAxis, activeAxis, checks],
  );
  const filtered = useMemo(() => {
    const arr = severityFilter === "all" ? inAxis : inAxis.filter((c) => c.severity === severityFilter);
    return [...arr].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
  }, [inAxis, severityFilter]);

  if (checks.length === 0) return null;

  return (
    <section className="px-6 py-10 border-b border-rule">
      <div className="max-w-[1100px] mx-auto">
        <div className="flex items-baseline gap-3 mb-2">
          <span className="text-[10.5px] uppercase tracking-[0.12em] text-ink/45 mono">
            CHECK RESULTS
          </span>
        </div>
        <h2 className="h-display text-[24px] h-navy mb-1">What we checked</h2>
        <p className="text-[12.5px] text-ink/55 mb-4 max-w-2xl">
          Every check, grouped by what it tells you about your docs. Click any row to see the
          actual HTTP probes that produced its verdict.
        </p>

        <AxisTabs
          activeAxis={activeAxis}
          setActiveAxis={setActiveAxis}
          counts={countsByAxis(checks)}
        />
        <div className="mt-3 mb-3 px-1 text-[12px] text-ink/65 max-w-2xl">
          {activeAxis !== "all" && (
            <>
              <span className="font-medium text-ink/85">
                {AXIS_LABELS[activeAxis].title}.
              </span>{" "}
              {AXIS_LABELS[activeAxis].subtitle}
            </>
          )}
        </div>

        <SeverityFilters
          active={severityFilter}
          setActive={setSeverityFilter}
          counts={countsBySeverity(inAxis)}
        />

        <div className="card mt-3 divide-y divide-rule">
          {filtered.length === 0 ? (
            <div className="px-4 py-8 text-center text-[12.5px] text-ink/50">
              No checks match the current filter.
            </div>
          ) : (
            filtered.map((c) => <CheckRow key={`${c.id}:${c.details?.pageUrl ?? ""}`} check={c} />)
          )}
        </div>
      </div>
    </section>
  );
}

function AxisTabs({
  activeAxis,
  setActiveAxis,
  counts,
}: {
  activeAxis: AxisFilter;
  setActiveAxis: (a: AxisFilter) => void;
  counts: { all: number; perAxis: Record<Axis, { fail: number; warn: number; total: number }> };
}) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
      <AxisTab
        label="All"
        sub="every check"
        active={activeAxis === "all"}
        issueCount={0}
        total={counts.all}
        onClick={() => setActiveAxis("all")}
      />
      {AXIS_ORDER.map((axis) => {
        const c = counts.perAxis[axis];
        return (
          <AxisTab
            key={axis}
            label={AXIS_LABELS[axis].title}
            sub={`${c.total} check${c.total === 1 ? "" : "s"}`}
            active={activeAxis === axis}
            issueCount={c.fail + c.warn}
            total={c.total}
            onClick={() => setActiveAxis(axis)}
          />
        );
      })}
    </div>
  );
}

function AxisTab({
  label,
  sub,
  active,
  issueCount,
  onClick,
}: {
  label: string;
  sub: string;
  active: boolean;
  issueCount: number;
  total: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left rounded-lg border px-4 py-3 transition-all ${
        active
          ? "bg-ink text-white border-ink shadow-card"
          : "bg-white border-rule hover:border-ink/30"
      }`}
    >
      <div className="flex items-baseline gap-2">
        <span className={`text-[13px] font-semibold ${active ? "text-white" : "text-ink"}`}>
          {label}
        </span>
        {issueCount > 0 && (
          <span
            className={`mono text-[10.5px] font-bold px-1.5 py-px rounded ${
              active
                ? "bg-white/15 text-white"
                : "bg-fail-bg text-[color:var(--color-fail-ring)]"
            }`}
          >
            {issueCount}
          </span>
        )}
      </div>
      <div className={`text-[11px] mt-0.5 ${active ? "text-white/70" : "text-ink/50"}`}>
        {sub}
      </div>
    </button>
  );
}

function SeverityFilters({
  active,
  setActive,
  counts,
}: {
  active: SeverityFilter;
  setActive: (s: SeverityFilter) => void;
  counts: Record<Severity, number>;
}) {
  const total = counts.fail + counts.warn + counts.pass + counts.info;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <FilterPill active={active === "all"} onClick={() => setActive("all")}>
        all <CountBadge>{total}</CountBadge>
      </FilterPill>
      {(["fail", "warn", "pass", "info"] as const).map((s) => (
        <FilterPill key={s} active={active === s} onClick={() => setActive(s)}>
          {s} <CountBadge>{counts[s]}</CountBadge>
        </FilterPill>
      ))}
    </div>
  );
}

function FilterPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-[11px] uppercase tracking-[0.08em] px-2.5 py-1 rounded-full border transition-colors ${
        active
          ? "bg-ink text-white border-ink"
          : "bg-white text-ink/55 border-rule hover:border-ink/30"
      }`}
    >
      {children}
    </button>
  );
}

function CountBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="ml-1 mono text-[10px] opacity-70">{children}</span>
  );
}

function CheckRow({ check }: { check: CheckResult }) {
  const [expanded, setExpanded] = useState(false);
  const cfg = SEVERITY_STYLE[check.severity];
  const hasAudit = (check.audit?.length ?? 0) > 0;
  const affectedPages = (check.details as { affectedPages?: string[] } | undefined)?.affectedPages;
  const pageCount = affectedPages?.length ?? 0;

  return (
    <div>
      <button
        type="button"
        onClick={() => hasAudit && setExpanded((v) => !v)}
        className={`w-full text-left px-4 py-3.5 flex items-start gap-3 ${
          hasAudit ? "hover:bg-paper-dim/50 cursor-pointer" : "cursor-default"
        }`}
        disabled={!hasAudit}
      >
        <span
          className={`shrink-0 mt-0.5 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.08em] font-semibold ${cfg.pill}`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
          {cfg.label}
          {pageCount > 0 && (
            <span className="ml-1 mono opacity-70">×{pageCount}</span>
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-[13.5px] text-ink leading-tight">
            {check.title}
          </div>
          <p className="text-[12px] text-ink/60 mt-0.5 leading-relaxed">
            <span className="mono text-[10.5px] text-ink/40 mr-1.5">{check.id}</span>
            {check.conclusion ?? check.message}
          </p>
        </div>
        {hasAudit && (
          <span
            className={`shrink-0 mt-0.5 text-ink/40 transition-transform ${
              expanded ? "rotate-180" : ""
            }`}
          >
            ▾
          </span>
        )}
      </button>
      {expanded && hasAudit && (
        <div className="px-4 pb-4">
          <AuditTrail audit={check.audit ?? []} />
        </div>
      )}
    </div>
  );
}

function groupByAxis(checks: CheckResult[]): Record<Axis, CheckResult[]> {
  const out: Record<Axis, CheckResult[]> = { agent: [], geo: [], context: [] };
  for (const c of checks) out[axisOf(c.id)].push(c);
  return out;
}

function countsByAxis(checks: CheckResult[]): {
  all: number;
  perAxis: Record<Axis, { fail: number; warn: number; total: number }>;
} {
  const perAxis: Record<Axis, { fail: number; warn: number; total: number }> = {
    agent: { fail: 0, warn: 0, total: 0 },
    geo: { fail: 0, warn: 0, total: 0 },
    context: { fail: 0, warn: 0, total: 0 },
  };
  for (const c of checks) {
    const ax = axisOf(c.id);
    perAxis[ax].total++;
    if (c.severity === "fail") perAxis[ax].fail++;
    else if (c.severity === "warn") perAxis[ax].warn++;
  }
  return { all: checks.length, perAxis };
}

function countsBySeverity(checks: CheckResult[]): Record<Severity, number> {
  const out: Record<Severity, number> = { fail: 0, warn: 0, pass: 0, info: 0 };
  for (const c of checks) out[c.severity]++;
  return out;
}

export function AuditTrail({ audit }: { audit: AuditEntry[] }) {
  return (
    <div className="rounded-lg overflow-hidden border border-[color:var(--color-rule-dark)]/20">
      <div className="bg-[color:var(--color-agent-bg)] text-[color:var(--color-agent-fg)] mono text-[11.5px] leading-relaxed p-4 space-y-2">
        {audit.map((a, i) => (
          <div key={i} className="space-y-0.5">
            <div>
              <span className="text-[color:var(--color-agent-muted)]">{a.method}</span>{" "}
              <span>{a.url}</span>
            </div>
            <div className="pl-4 text-[color:var(--color-agent-muted)]">
              └─{" "}
              <span
                className={
                  a.status >= 200 && a.status < 300
                    ? "text-emerald-400"
                    : a.status >= 300 && a.status < 400
                      ? "text-sky-400"
                      : a.status >= 400
                        ? "text-rose-400"
                        : "text-amber-400"
                }
              >
                {a.status || "ERR"}
              </span>
              {a.headers && Object.keys(a.headers).length > 0 && (
                <span>
                  {" "}
                  ·{" "}
                  {Object.entries(a.headers)
                    .map(([k, v]) => `${k}: ${v}`)
                    .join(" · ")}
                </span>
              )}
              {a.note && <span> · {a.note}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
