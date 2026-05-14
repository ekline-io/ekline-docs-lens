"use client";

import { useMemo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useScanRun } from "@/hooks/useScanRun";
import { ScanProgress } from "@/components/scan/ScanProgress";
import { SiteHeader } from "@/components/SiteHeader";
import { ScanRunBar } from "@/components/scan/ScanRunBar";
import { deriveStatuses } from "@/lib/profile-status";
import { ResultHero } from "@/components/scan/ResultHero";
import { ProfileStatusCards } from "@/components/scan/ProfileStatusCards";
import { AgentFixPrompt } from "@/components/scan/AgentFixPrompt";
import { AllChecksList } from "@/components/scan/AllChecksList";
import { PageMatrix } from "@/components/scan/PageMatrix";
import { LivePreview } from "@/components/scan/LivePreview";
import { ScanLiveFeed } from "@/components/scan/ScanLiveFeed";
import { AccuracyDisclaimer } from "@/components/AccuracyDisclaimer";
import { generateAgentFixPrompt } from "@/lib/fix/prompt";
import { allFixCopyKeys } from "@/lib/fix/check-fix-copy";
import type { ProfileId } from "@/lib/core/types";

const TOTAL_CHECKS = allFixCopyKeys().length;

function gradeFor(score: number): string {
  if (score === 100) return "A+";
  if (score >= 97) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 61) return "D";
  return "F";
}

function computeScoreFromFindings(findingsCount: { fail: number; warn: number }): number {
  // Linear: each fail -7, each warn -3, floor 0.
  return Math.max(0, 100 - findingsCount.fail * 7 - findingsCount.warn * 3);
}

export default function ScanPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? null;
  const state = useScanRun(id);

  const ready = state.status === "done" || state.status === "stopped";

  const perProfile = useMemo(() => deriveStatuses(state.siteStats ?? null), [state.siteStats]);

  // Detect intentionally-skipped profiles by sniffing the first page's
  // profile reasons. We mark the corresponding card as "skipped" with a
  // gray treatment instead of a misleading red "Broken" + 100% clean bar.
  const skipDetection = useMemo(() => {
    const result: Partial<Record<ProfileId, { status: "skipped"; reason: string }>> = {};
    const firstProfiles = state.result?.pages?.[0]?.profiles;
    if (!firstProfiles) return result;
    for (const id of ["rawHttp", "headless", "snippet"] as const) {
      const profile = firstProfiles[id];
      if (profile && !profile.ok && profile.reason?.startsWith("Skipped")) {
        result[id] = { status: "skipped", reason: profile.reason };
      }
    }
    return result;
  }, [state.result]);

  const perProfileWithSkips = useMemo(() => {
    const merged = { ...perProfile } as Record<ProfileId, "good" | "partial" | "broken" | "skipped">;
    for (const id of Object.keys(skipDetection) as ProfileId[]) {
      merged[id] = "skipped";
    }
    return merged;
  }, [perProfile, skipDetection]);

  const skipReasons = useMemo(() => {
    const out: Partial<Record<ProfileId, string>> = {};
    for (const [id, info] of Object.entries(skipDetection)) {
      out[id as ProfileId] = info.reason;
    }
    return out;
  }, [skipDetection]);

  const findingCounts = useMemo(() => {
    const counts: Record<ProfileId, number> = { rawHttp: 0, headless: 0, snippet: 0 };
    for (const f of state.fixes) {
      if (f.affectedProfiles === "general") continue;
      for (const p of f.affectedProfiles) counts[p] = (counts[p] ?? 0) + 1;
    }
    return counts;
  }, [state.fixes]);

  // General findings (site-wide signals like a missing llms.txt) aren't tied
  // to a specific reader profile but still drag the overall grade down. We
  // surface this count on each reader card so the per-reader "0 issues"
  // doesn't visually contradict the site-level grade.
  const generalCount = useMemo(
    () => state.fixes.filter((f) => f.affectedProfiles === "general").length,
    [state.fixes],
  );

  const failCount = useMemo(
    () => state.fixes.filter((f) => f.severity === "fail").length,
    [state.fixes],
  );
  const warnCount = useMemo(
    () => state.fixes.filter((f) => f.severity === "warn").length,
    [state.fixes],
  );
  const siteChecks = state.result?.siteChecks ?? [];
  const haveAuditDetail = siteChecks.length > 0;
  const applicableChecks = useMemo(() => {
    if (haveAuditDetail) {
      return siteChecks.filter((c) => c.severity !== "info").length;
    }
    // Snapshot not yet loaded — assume every check that produced a finding
    // is applicable, plus we don't yet know how many passed. Best guess:
    // TOTAL_CHECKS minus a typical info count (OAuth/MCP/Skills/A2A/Web
    // Bot Auth tend to be info on docs sites; ~10 of 38).
    return Math.max(failCount + warnCount, TOTAL_CHECKS - 10);
  }, [haveAuditDetail, siteChecks, failCount, warnCount]);
  const inapplicableChecks = useMemo(
    () =>
      haveAuditDetail
        ? siteChecks.filter((c) => c.severity === "info").length
        : TOTAL_CHECKS - applicableChecks,
    [haveAuditDetail, siteChecks, applicableChecks],
  );
  const passCount = useMemo(
    () => Math.max(0, applicableChecks - failCount - warnCount),
    [applicableChecks, failCount, warnCount],
  );
  const score = useMemo(
    () => computeScoreFromFindings({ fail: failCount, warn: warnCount }),
    [failCount, warnCount],
  );
  const grade = gradeFor(score);

  const rootUrl = state.result?.config.rootUrl ?? "";
  const promptText = useMemo(() => {
    if (!ready || !rootUrl) return "";
    return generateAgentFixPrompt({
      siteUrl: rootUrl,
      siteName: hostnameOf(rootUrl),
      score,
      grade,
      findings: state.fixes,
    });
  }, [ready, rootUrl, score, grade, state.fixes]);

  return (
    <div className="min-h-screen flex flex-col bg-paper">
      <SiteHeader />
      <ScanProgress state={state} runId={id} />
      <main className="flex-1 flex flex-col">
        <ScanRunBar state={state} />
        {/* Persistent hero: shows the user's site through three agent readers,
            both during and after the scan. Stays visible as the page scrolls
            so the visual hook never disappears. */}
        <LivePreview runId={id} state={state} />
        <ScanLiveFeed state={state} />
        {ready && (
          <>
            <ResultHero
              perProfile={perProfile}
              siteName={hostnameOf(rootUrl)}
              rootUrl={hostnameOf(rootUrl)}
              score={score}
              grade={grade}
              totalChecks={TOTAL_CHECKS}
              applicableChecks={applicableChecks}
              inapplicableChecks={inapplicableChecks}
              failCount={failCount}
              warnCount={warnCount}
              pagesScanned={state.pages.length}
              discoverySource={state.discover?.source ?? state.siteStats?.source}
              capped={state.discover?.capped ?? state.siteStats?.capped}
            />
            <ProfileStatusCards
              perProfile={perProfileWithSkips}
              findingCounts={findingCounts}
              generalCount={generalCount}
              totalChecks={TOTAL_CHECKS}
              skipReasons={skipReasons}
              tokensPerProfile={state.siteStats?.avgTokensClaudePerProfile}
            />
            {/* Action before details: the agent-fix prompt is the actionable
                output, give it pride of place above the deep audit list. */}
            <AgentFixPrompt
              prompt={promptText}
              failCount={failCount}
              warnCount={warnCount}
            />
            <AllChecksList checks={state.result?.siteChecks ?? []} />
            <PageMatrix pages={state.pages} runId={id ?? ""} />
            <AccuracyDisclaimer />
          </>
        )}
      </main>
      <footer className="border-t border-rule py-4 px-6 text-center text-[11px] text-ink/45">
        <Link href="/methodology" className="hover:text-accent transition-colors">
          Methodology
        </Link>
        <span className="mx-2 text-ink/25">·</span>
        Educational tool by EkLine
      </footer>
    </div>
  );
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}
