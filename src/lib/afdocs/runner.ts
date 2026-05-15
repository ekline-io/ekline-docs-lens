/**
 * Adapter that runs afdocs as a parallel sub-runner alongside our crawl and
 * normalizes its `ReportResult` into our `CheckResult[]` shape.
 *
 * Why a sub-runner not a check-by-check call:
 *   afdocs owns its crawl (its own sampling, HTTP rate limiter, page caches).
 *   Calling `runChecks()` gets us the full afdocs verdict for the rubric it
 *   covers without bridging two different context shapes.
 *
 * The visible cost is a second crawl per scan. afdocs's default
 * `requestDelay: 200ms` keeps it polite to the target; in practice it adds
 * a few seconds to a 10-page scan.
 */
import { runChecks } from "afdocs";
import { computeScore } from "afdocs";
import type {
  CheckResult as AfdocsCheckResult,
  ReportResult,
  RunnerOptions,
} from "afdocs";
import type { CheckResult, CategoryId, Severity } from "@/lib/types";
import { AFDOCS_PINNED_VERSION } from "@/lib/fix/afdocs-version";

/**
 * Map afdocs `CheckStatus` to our `Severity`. afdocs's `skip` becomes our
 * `info` (we render it as informational, not failing). `error` becomes
 * `fail` so the user notices something went wrong rather than seeing a
 * silently absent verdict.
 */
function mapStatus(status: AfdocsCheckResult["status"]): Severity {
  if (status === "pass") return "pass";
  if (status === "warn") return "warn";
  if (status === "fail") return "fail";
  if (status === "error") return "fail";
  return "info"; // skip
}

/**
 * Map afdocs categories onto our `CategoryId` union. Most are 1:1.
 * `markdown-availability` rolls into our `discoverability` since both are
 * about agents finding machine-readable content.
 */
function mapCategory(category: string): CategoryId {
  switch (category) {
    case "content-discoverability":
    case "markdown-availability":
      return "discoverability";
    case "page-size":
      return "page-size";
    case "content-structure":
      return "content-structure";
    case "url-stability":
      return "url-stability";
    case "observability":
      return "observability";
    case "authentication":
      return "authentication";
    default:
      return "content-accessibility";
  }
}

export interface AfdocsRunResult {
  /** Normalized into our shape, ready to merge into the run findings stream. */
  results: CheckResult[];
  /** afdocs's own score (we don't display this; useful for parity logging). */
  score: number | null;
  /** Total ms the afdocs sub-runner took, end to end. */
  durationMs: number;
  /** Error string if the sub-runner threw or timed out. */
  error?: string;
}

/**
 * Run afdocs against `rootUrl` and adapt its output to our shape. Errors
 * are caught and returned as an empty result with an `error` field — the
 * parent scan should never fail because afdocs did. Worst case: the user
 * sees 18 only-ours checks instead of 41.
 */
export async function runAfdocsChecks(
  rootUrl: string,
  options: Partial<RunnerOptions> = {},
): Promise<AfdocsRunResult> {
  const start = Date.now();
  try {
    const report = await runChecks(rootUrl, options);
    const score = computeScore(report).overall;
    const results = report.results.map((r) => normalize(r, report));
    return { results, score, durationMs: Date.now() - start };
  } catch (err) {
    return {
      results: [],
      score: null,
      durationMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function normalize(r: AfdocsCheckResult, report: ReportResult): CheckResult {
  return {
    id: r.id,
    category: mapCategory(r.category),
    severity: mapStatus(r.status),
    // afdocs doesn't ship a separate `title`; the message is the per-run
    // verdict. The methodology page's title comes from check-fix-copy. Here
    // we use the message as a fallback when no copy exists.
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
