import type { FetchContext, ProfileId, ProfileResult } from "./types";
import type { BrowserCtx } from "./browser-ctx";

import { rawHttpProfile } from "@/lib/profiles/rawHttp";
import { headlessProfile } from "@/lib/profiles/headless";
import { snippetProfile } from "@/lib/profiles/snippet";

export type RegisteredProfile =
  | {
      id: ProfileId;
      kind: "single-arg";
      fetch: (ctx: FetchContext) => Promise<ProfileResult>;
    }
  | {
      id: ProfileId;
      kind: "two-arg";
      fetch: (ctx: FetchContext, deps: BrowserCtx) => Promise<ProfileResult>;
    };

const registry = new Map<ProfileId, RegisteredProfile>();

export function registerProfile(p: RegisteredProfile): void {
  registry.set(p.id, p);
}

export function allProfiles(): RegisteredProfile[] {
  return [...registry.values()];
}

export async function runProfile(
  id: ProfileId,
  ctx: FetchContext,
  deps?: BrowserCtx,
): Promise<ProfileResult> {
  const entry = registry.get(id);
  if (!entry) throw new Error(`unknown profile: ${id}`);
  if (entry.kind === "single-arg") return entry.fetch(ctx);
  if (!deps) {
    throw new Error(`profile ${id} requires BrowserCtx deps`);
  }
  return entry.fetch(ctx, deps);
}

registerProfile({ id: "rawHttp", kind: "single-arg", fetch: rawHttpProfile.fetch });
registerProfile({ id: "headless", kind: "two-arg", fetch: headlessProfile.fetch });
registerProfile({ id: "snippet", kind: "single-arg", fetch: snippetProfile.fetch });
