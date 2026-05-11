import type { FetchContext, ProfileId, ProfileResult } from "./types";

export interface Profile {
  readonly id: ProfileId;
  fetch(ctx: FetchContext): Promise<ProfileResult>;
}

export function emptyResult(id: ProfileId, reason: string, durationMs: number): ProfileResult {
  return {
    id,
    ok: false,
    reason,
    bytes: 0,
    chars: 0,
    tokensClaude: 0,
    tokensGpt: 0,
    markdown: "",
    durationMs,
  };
}
