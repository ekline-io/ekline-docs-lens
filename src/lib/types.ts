export type Severity = "pass" | "warn" | "fail" | "info";

/**
 * Rough chars→tokens estimate. English prose is ~4 chars/token; code and
 * markdown run a touch tighter. We round to a whole token and label the
 * number "≈" everywhere it surfaces so readers know it's not exact.
 */
export function tokensFromChars(chars: number): number {
  if (chars <= 0) return 0;
  return Math.round(chars / 4);
}

/**
 * Headline estimate for the Haiku-distilled answer that actually reaches
 * Claude Code's main context. Based on CTO-shared measurements:
 * docs.stripe.com/api ≈ 370 input tokens → ≈ 120 output tokens. Most docs
 * pages cluster in the same 100–300 token band because Haiku is told to be
 * concise. Not a hard number — just a calibration anchor.
 */
export type CategoryId =
  | "discoverability"
  | "content-accessibility"
  | "page-size"
  | "content-structure"
  | "content-quality"
  | "url-stability"
  | "observability"
  | "authentication"
  | "capability-discovery";

/**
 * User-facing axes. Every check maps to exactly one axis via AXIS_OF below.
 * Internal CategoryId is kept for scoring; Axis is what the UI groups by.
 */
export type Axis = "agent" | "geo" | "context";

export const AXIS_LABELS: Record<Axis, { title: string; subtitle: string }> = {
  agent: {
    title: "Agent Retrieval",
    subtitle: "Can Claude Code, Cursor, and Copilot fetch and parse your content?",
  },
  geo: {
    title: "GEO, Generative Engine Optimization",
    subtitle: "Can Perplexity, ChatGPT Search, and Google AI Overviews cite you?",
  },
  context: {
    title: "Context Management",
    subtitle: "Does your content survive truncation, conversion, and chunking?",
  },
};

/** Explicit per-check axis assignment. Hardcoded so it's auditable. */
export const AXIS_OF: Record<string, Axis> = {
  // Agent retrieval, can agents fetch your docs at all?
  "llms-txt-exists": "agent",
  "llms-txt-valid": "agent",
  "llms-txt-size": "agent",
  "llms-txt-links-resolve": "agent",
  "llms-txt-links-markdown": "agent",
  "llms-txt-directive": "agent",
  "llms-txt-freshness": "agent",
  "markdown-url-support": "agent",
  "content-negotiation": "agent",
  "rendering-strategy": "agent",
  "http-status-codes": "agent",
  "redirect-behavior": "agent",
  "auth-gate-detection": "agent",
  "auth-alternative-access": "agent",
  "well-known-mcp-card": "agent",
  "well-known-agent-skills": "agent",
  "oauth-discovery": "agent",
  "oauth-protected-resource": "agent",
  "link-headers": "agent",
  "cache-headers": "agent",
  "a2a-agent-card": "agent",

  // GEO, can answer engines find and cite you?
  "robots-txt": "geo",
  "content-signals": "geo",
  "well-known-api-catalog": "geo",
  "link-header-api-catalog": "geo",
  "metadata-completeness": "geo",
  "sitemap": "geo",
  "ai-bot-rules": "geo",
  "web-bot-auth": "geo",

  // Context management, does content structure survive agent pipelines?
  "page-size-html": "context",
  "page-size-markdown": "context",
  "content-start-position": "context",
  "tabbed-content-serialization": "context",
  "markdown-code-fence-validity": "context",
  "heading-hierarchy": "context",
  "image-alt-coverage": "context",
  "json-code-block-validity": "context",
  "internal-link-integrity": "context",
  "prose-write-good": "context",
  "prose-sentence-length": "context",
  "prose-jargon": "context",
};

export function axisOf(checkId: string): Axis {
  return AXIS_OF[checkId] ?? "context";
}

export const CATEGORY_WEIGHTS: Record<CategoryId, number> = {
  discoverability: 18,
  "content-accessibility": 18,
  "page-size": 18,
  "content-structure": 13,
  "content-quality": 10,
  "url-stability": 9,
  observability: 5,
  authentication: 5,
  "capability-discovery": 4,
};

export const CATEGORY_LABELS: Record<CategoryId, string> = {
  discoverability: "Discoverability",
  "content-accessibility": "Content Accessibility",
  "page-size": "Page Size & Truncation",
  "content-structure": "Content Structure",
  "content-quality": "Prose Quality",
  "url-stability": "URL Stability",
  observability: "Observability",
  authentication: "Authentication",
  "capability-discovery": "Capability Discovery",
};

/**
 * One HTTP probe captured for a check's audit trail. Mirrors what the user
 * could re-run with `curl -I` or `curl -i`; the substance of the check, not
 * a UI summary.
 */
export interface AuditEntry {
  /** "GET", "HEAD", etc. */
  method: string;
  /** Full URL probed. */
  url: string;
  /** HTTP status code. 0 if the request threw before getting a response. */
  status: number;
  /** Selected response headers, lower-cased. e.g. { "content-type": "text/html" } */
  headers?: Record<string, string>;
  /** Optional one-line note about what this probe established. */
  note?: string;
}

export interface CheckResult {
  id: string;
  category: CategoryId;
  /**
   * User-facing axis. Optional in source, stamped centrally before emit ,
   * so at runtime, every check delivered to a client has it.
   */
  axis?: Axis;
  severity: Severity;
  title: string;
  message: string;
  fix?: string;
  /**
   * Plain-language "why this matters" explanation. Stamped centrally from
   * WHY_CONTENT; keeps editorial content in one place.
   */
  why?: string;
  source: string;
  impl: string;
  details?: Record<string, unknown>;
  /** HTTP probes performed by this check (for the audit trail UI). */
  audit?: AuditEntry[];
  /** One-line "what we concluded" — drives the all-checks-list summary. */
  conclusion?: string;
}

export interface PipelineStep {
  name: string;
  ms: number;
  note?: string;
}

export interface ContentBudgetSegment {
  label: string;
  color: string;
  bytes: number;
  pct: number;
}

export interface ScanResult {
  url: string;
  finalUrl: string;
  fetchedAt: string;
  pipeline: PipelineStep[];
  human: {
    statusCode: number;
    contentType: string;
    bytes: number;
    html: string;
  };
  agent: {
    markdown: string;
    markdownBytes: number;
    truncatedAt: number | null;
    truncationReason: string | null;
    contentStartPct: number;
  };
  budget: {
    totalBytes: number;
    segments: ContentBudgetSegment[];
  };
  score: {
    overall: number;
    grade: string;
    byCategory: Record<CategoryId, { score: number; weight: number }>;
  };
  checks: CheckResult[];
  /** Axis demo card payload — populated by scan.ts. */
  axisData: AxisData;
}

// ---------- Client-facing types (consumed by hooks + UI) ----------

export const AXIS_ORDER: Axis[] = ["agent", "geo", "context"];

export interface CommonIssue {
  id: string;
  title: string;
  count: number;
  severity: Severity;
  axis: Axis;
  message: string;
  fix?: string;
  why?: string;
  exampleUrls: string[];
}

export interface SiteObservation {
  axis: Axis;
  headline: string;
  fix?: string;
  tone: "clean" | "watch" | "concern";
  axisData: AgentRetrievalData | GeoData | ContextData;
}

export interface CrawlPage {
  url: string;
  grade: string;
  overall: number;
  failCount: number;
  warnCount: number;
  /** Full scan result so the UI can expand inline without another round-trip. */
  scan: ScanResult;
}

export interface CrawlResult {
  origin: string;
  pages: CrawlPage[];
  aggregateScore: number;
  aggregateGrade: string;
  commonIssues: CommonIssue[];
  observations: SiteObservation[];
  discoveredVia: "llms-txt" | "sitemap" | "html" | "start-only";
  fetchedAt: string;
}

// ---------- Axis demo card data shapes (Bundle C) ----------

/** Outcome of one HTTP probe shown in the Agent Retrieval card. */
export interface ProbeResult {
  /** "GET /llms.txt" or similar — display label for the row. */
  label: string;
  /** Plain status word: "200" | "404" | "html" | "none" | "error" | "empty". */
  statusText: string;
  /** Right-aligned secondary description, e.g. "3.2 KB · 38 link entries". */
  detail: string;
  /** Overall verdict for this probe. */
  pass: boolean;
}

export interface AgentRetrievalData {
  /** Exactly four probes, fixed order: llms.txt, page.md, Accept header, Content-Signals. */
  probes: ProbeResult[];
  /** Number of probes with pass === true (0..4). */
  passingCount: number;
}

export interface MetaCardData {
  domain: string;
  title: string | null;
  description: string | null;
  canonicalUrl: string | null;
  ogTitle: string | null;
  ogImageUrl: string | null;
  /** Count of non-null fields among title, description, canonical, ogTitle, ogImage (0..5). */
  presentCount: number;
}

export interface GeoData {
  card: MetaCardData;
}

export interface ContextData {
  htmlBytes: number;
  markdownBytes: number;
  /** Reuses ContentBudgetSegment from existing `agent.budget` shape. */
  budgetSegments: ContentBudgetSegment[];
  contentStartPct: number;
  /** Percent of total HTML bytes that are the "content" segment (0..100). */
  contentSharePct: number;
}

/** Bundle of all three axis demos for one scan. */
export interface AxisData {
  agent: AgentRetrievalData;
  geo: GeoData;
  context: ContextData;
}
