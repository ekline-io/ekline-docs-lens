export const PROFILE_IDS = ["rawHttp", "headless", "snippet"] as const;

export type ProfileId = (typeof PROFILE_IDS)[number];

export function isProfileId(x: unknown): x is ProfileId {
  return typeof x === "string" && (PROFILE_IDS as readonly string[]).includes(x);
}

export interface ProfileResult {
  id: ProfileId;
  ok: boolean;
  reason?: string;
  bytes: number;
  chars: number;
  tokensClaude: number;
  tokensGpt: number;
  markdown: string;
  rawArtifact?: string;
  /**
   * Optional viewport screenshot of the rendered page, encoded as a JPEG
   * data URL. Populated by the headless profile's Playwright path only —
   * the Jina backend doesn't have a cheap screenshot path. Used by the
   * UI as a fallback for sites that block iframe embedding via
   * X-Frame-Options or frame-ancestors.
   */
  screenshot?: string;
  durationMs: number;
}

export interface FetchContext {
  url: string;
  userAgent: string;
  timeoutMs: number;
  signal?: AbortSignal;
}

export const DEFAULT_FETCH_CONTEXT = {
  userAgent:
    "docs-lens/0.2 (+https://ekline.io; deterministic docs scanner)",
  timeoutMs: 20_000,
};
