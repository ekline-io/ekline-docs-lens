/**
 * Adapter that runs afdocs as a parallel sub-runner. afdocs owns its own
 * crawl, sampling, and HTTP client; we treat its `ReportResult` as opaque
 * and normalize it into our `CheckResult` shape.
 */
import { runChecks } from "afdocs";
import type {
  CheckResult as AfdocsCheckResult,
  ReportResult,
  RunnerOptions,
} from "afdocs";
import type { CheckResult, CategoryId, Severity } from "@/lib/types";
import { AFDOCS_PINNED_VERSION } from "@/lib/fix/afdocs-version";

const STATUS_TO_SEVERITY: Record<AfdocsCheckResult["status"], Severity> = {
  pass: "pass",
  warn: "warn",
  fail: "fail",
  // afdocs `error` collapses to `fail` so a broken probe doesn't silently
  // disappear — users see the check is unhappy.
  error: "fail",
  skip: "info",
};

const CATEGORY_TO_AXIS: Record<string, CategoryId> = {
  "content-discoverability": "discoverability",
  "markdown-availability": "discoverability",
  "page-size": "page-size",
  "content-structure": "content-structure",
  "url-stability": "url-stability",
  observability: "observability",
  authentication: "authentication",
};

export interface AfdocsRunResult {
  results: CheckResult[];
  durationMs: number;
  error?: string;
}

export interface AfdocsRunOptions extends Partial<RunnerOptions> {
  /**
   * Cap on afdocs's page sampling. Note afdocs's `maxLinksToTest` also
   * bounds per-check link probes (`llms-txt-links-resolve` etc.), so we
   * floor at afdocs's default (50) to avoid crippling link checks when
   * our crawl cap is low (e.g. cap=10).
   */
  pageCap?: number;
}

const AFDOCS_DEFAULT_LINK_PROBES = 50;

export async function runAfdocsChecks(
  rootUrl: string,
  options: AfdocsRunOptions = {},
): Promise<AfdocsRunResult> {
  const start = Date.now();
  const { pageCap, ...rest } = options;
  const runnerOpts: Partial<RunnerOptions> = {
    samplingStrategy: "deterministic",
    ...rest,
    ...(pageCap !== undefined
      ? { maxLinksToTest: Math.max(pageCap, AFDOCS_DEFAULT_LINK_PROBES) }
      : {}),
  };
  try {
    const report = await runChecks(rootUrl, runnerOpts);
    const results = report.results.map((r) => normalize(r, report));
    return { results, durationMs: Date.now() - start };
  } catch (err) {
    return {
      results: [],
      durationMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function normalize(r: AfdocsCheckResult, report: ReportResult): CheckResult {
  return {
    id: r.id,
    category: CATEGORY_TO_AXIS[r.category] ?? "discoverability",
    severity: STATUS_TO_SEVERITY[r.status],
    title: r.message,
    message: r.message,
    source: "afdocs",
    impl: `afdocs@${AFDOCS_PINNED_VERSION}`,
    details: {
      ...(r.details ?? {}),
      afdocsCategory: r.category,
      afdocsStatus: r.status,
      afdocsSpecUrl: report.specUrl,
    },
  };
}
