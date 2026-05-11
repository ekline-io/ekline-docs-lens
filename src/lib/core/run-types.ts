import type { ProfileId, ProfileResult } from "./types";
import type { FixFinding } from "@/lib/fix/types";
import type { CheckResult } from "@/lib/types";

export interface RunConfig {
  /** Seed URL the user pasted in. */
  rootUrl: string;
  /** Hard cap on pages scanned. Defaults to 10. */
  cap?: number;
  /** Number of pages worked on in parallel. Defaults to 4. */
  pageConcurrency?: number;
  /** Max parallel browser contexts. Defaults to 4. */
  browserMaxContexts?: number;
}

export interface PageProfileSummary {
  id: ProfileId;
  ok: boolean;
  reason?: string;
  chars: number;
  tokensClaude: number;
  tokensGpt: number;
  durationMs: number;
}

export interface PageResult {
  url: string;
  /** Full per-profile results, six entries (one per ProfileId). */
  profiles: Record<ProfileId, ProfileResult>;
  /** Compact summary for site-stats and matrix UI. */
  summary: Record<ProfileId, PageProfileSummary>;
  /** Per-page diff metrics; populated by the diff layer. */
  diff?: PageDiff;
  /** Per-page check results (rendering-strategy, page-size, headings, alt, etc.) */
  pageChecks?: CheckResult[];
}

export interface PageDiff {
  /** Largest profile (by chars) for this page. */
  largestProfile: ProfileId;
  /** Each profile's chars / largest.chars (0..1). */
  charsFraction: Record<ProfileId, number>;
  /** (headless.chars - rawHttp.chars) / max(1, headless.chars), clamped 0..1. */
  jsGatedFraction: number;
}

export interface SiteStats {
  pagesScanned: number;
  source: "sitemap" | "bfs";
  capped: boolean;
  /** Average JS-gated fraction across pages where headless is ok. */
  avgJsGatedFraction: number;
  /** Average tokens (Claude) per profile across all pages. */
  avgTokensClaudePerProfile: Record<ProfileId, number>;
  /** Number of fail/warn fixes site-wide. */
  fixBacklog: number;
}

export type RunStatus = "queued" | "running" | "done" | "error" | "stopped";

export interface RunResult {
  id: string;
  config: RunConfig;
  status: RunStatus;
  startedAt: number;
  finishedAt?: number;
  pages: PageResult[];
  siteStats?: SiteStats;
  fixes: FixFinding[];
  /** Every site-level CheckResult, including passes — drives AllChecksList. */
  siteChecks?: CheckResult[];
  errorMessage?: string;
}

export type RunEvent =
  | { type: "discover"; pages: string[]; source: "sitemap" | "bfs"; capped: boolean }
  | { type: "page:start"; url: string; index: number }
  | { type: "profile:done"; url: string; profile: ProfileId; ok: boolean; chars: number; tokensClaude: number; durationMs: number }
  | { type: "page:done"; url: string; index: number; diff: PageDiff }
  | { type: "run:done"; siteStats: SiteStats; fixes: FixFinding[] }
  | { type: "run:stopped"; siteStats: SiteStats; fixes: FixFinding[]; reason: string }
  | { type: "run:error"; message: string };
