import type { ProfileId } from "@/lib/core/types";

type Status = "good" | "partial" | "broken" | "skipped";

function formatTokens(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k`;
  return `${Math.round(n)}`;
}

interface Props {
  perProfile: Record<ProfileId, Status>;
  findingCounts: Record<ProfileId, number>;
  /** Number of site-wide findings that affect every reader (e.g. missing llms.txt). */
  generalCount?: number;
  totalChecks?: number;
  /** Optional explanatory copy per profile (e.g. for "skipped"). */
  skipReasons?: Partial<Record<ProfileId, string>>;
  /** Average Claude-tokens this reader extracted, used to ground broken/partial copy. */
  tokensPerProfile?: Record<ProfileId, number>;
}

const LABELS: Record<ProfileId, { title: string; consumers: string; tagline: string }> = {
  rawHttp: {
    title: "Raw HTTP",
    consumers: "Claude Code · Cursor · Continue · Aider",
    tagline: "no JS · Turndown to markdown",
  },
  headless: {
    title: "Headless browser",
    consumers: "Atlas · Comet · Cline · Roo Code",
    tagline: "full Chromium · post-JS DOM",
  },
  snippet: {
    title: "Search snippet",
    consumers: "ChatGPT Search · Perplexity · You.com",
    tagline: "title + meta + first 200 chars only",
  },
};

const STATUS: Record<Status, { dot: string; label: string; bar: string; text: string }> = {
  good: {
    dot: "bg-emerald-500",
    label: "Good",
    bar: "bg-emerald-500",
    text: "text-emerald-700",
  },
  partial: {
    dot: "bg-amber-500",
    label: "Partial",
    bar: "bg-amber-500",
    text: "text-amber-700",
  },
  broken: {
    dot: "bg-rose-500",
    label: "Broken",
    bar: "bg-rose-500",
    text: "text-rose-700",
  },
  skipped: {
    dot: "bg-ink/30",
    label: "Skipped",
    bar: "bg-ink/15",
    text: "text-ink/55",
  },
};

export function ProfileStatusCards({
  perProfile,
  findingCounts,
  generalCount = 0,
  totalChecks = 30,
  skipReasons,
  tokensPerProfile,
}: Props) {
  const headlessTokens = tokensPerProfile?.headless ?? 0;
  return (
    <section className="px-6 py-8 border-b border-rule">
      <div className="max-w-[1100px] mx-auto">
        <div className="flex items-baseline gap-3 mb-4">
          <h3 className="text-[13px] font-semibold uppercase tracking-[0.08em] text-ink/60 mono">
            Three reader profiles
          </h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {(["rawHttp", "headless", "snippet"] as const).map((id) => {
            const status = perProfile[id];
            const count = findingCounts[id] ?? 0;
            const cleanFraction =
              totalChecks > 0 ? Math.max(0, Math.min(1, 1 - count / totalChecks)) : 1;
            const cleanPct = Math.round(cleanFraction * 100);
            const isSkipped = status === "skipped";
            const isBroken = status === "broken";
            const isPartial = status === "partial";
            const skipReason = skipReasons?.[id];
            const thisTokens = tokensPerProfile?.[id] ?? 0;
            // For partial readers, "cleanliness" alone is misleading — what
            // matters is how much of the page they actually saw vs the
            // headless baseline. Show retrieval %, not finding %.
            const retrievalPct =
              isPartial && headlessTokens > 0
                ? Math.max(0, Math.min(100, Math.round((thisTokens / headlessTokens) * 100)))
                : null;
            const borderTone = isBroken
              ? "ring-1 ring-rose-200"
              : isPartial
                ? "ring-1 ring-amber-200"
                : "";
            return (
              <div
                key={id}
                className={`card relative overflow-hidden p-5 hover:shadow-card-lift transition-shadow ${borderTone}`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className={`w-2 h-2 rounded-full ${STATUS[status].dot}`} />
                  <span className="font-semibold text-ink text-[15px]">
                    {LABELS[id].title}
                  </span>
                  <span
                    className={`ml-auto text-[10.5px] uppercase font-bold tracking-[0.08em] ${STATUS[status].text}`}
                  >
                    {STATUS[status].label}
                  </span>
                </div>
                <p className="text-[11px] text-ink/55 mono mb-1">{LABELS[id].tagline}</p>
                <p className="text-[11.5px] text-ink/65 mb-4">{LABELS[id].consumers}</p>
                {isSkipped || isBroken ? (
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-baseline">
                      <span className="text-[10.5px] uppercase tracking-[0.08em] text-ink/45 mono">
                        {isBroken ? "Retrieved" : "Cleanliness"}
                      </span>
                      <span
                        className={`text-[12.5px] font-bold mono ${
                          isBroken ? "text-rose-700" : "text-ink/40"
                        }`}
                      >
                        {isBroken ? "0%" : "—"}
                      </span>
                    </div>
                    <div className="h-1.5 bg-paper-dim rounded-full overflow-hidden">
                      <div
                        className={
                          isBroken
                            ? "h-full bg-rose-300 bg-[repeating-linear-gradient(45deg,transparent,transparent_4px,rgba(190,18,60,0.25)_4px,rgba(190,18,60,0.25)_8px)]"
                            : "h-full bg-ink/15 bg-[repeating-linear-gradient(45deg,transparent,transparent_4px,rgba(0,0,0,0.08)_4px,rgba(0,0,0,0.08)_8px)]"
                        }
                        style={{ width: "100%" }}
                      />
                    </div>
                  </div>
                ) : isPartial && retrievalPct !== null ? (
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-baseline">
                      <span className="text-[10.5px] uppercase tracking-[0.08em] text-ink/45 mono">
                        Retrieved
                      </span>
                      <span className="text-[12.5px] font-bold text-amber-700 mono">
                        {retrievalPct}%
                      </span>
                    </div>
                    <div className="h-1.5 bg-paper-dim rounded-full overflow-hidden">
                      <div
                        className={`h-full ${STATUS[status].bar} transition-all duration-500`}
                        style={{ width: `${retrievalPct}%` }}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-baseline">
                      <span className="text-[10.5px] uppercase tracking-[0.08em] text-ink/45 mono">
                        Cleanliness
                      </span>
                      <span className="text-[12.5px] font-bold text-ink">{cleanPct}%</span>
                    </div>
                    <div className="h-1.5 bg-paper-dim rounded-full overflow-hidden">
                      <div
                        className={`h-full ${STATUS[status].bar} transition-all duration-500`}
                        style={{ width: `${cleanPct}%` }}
                      />
                    </div>
                  </div>
                )}
                <p className="text-[12.5px] text-ink/75 mt-4">
                  {isSkipped
                    ? skipReason ?? "Skipped on this host."
                    : isBroken
                      ? headlessTokens > 0
                        ? `Returned no usable content. Other readers extracted up to ${formatTokens(headlessTokens)} tokens per page; this one sees an empty page.`
                        : "Returned no usable content for this site."
                      : isPartial && retrievalPct !== null
                        ? `Sees ${retrievalPct}% of what the headless browser sees (${formatTokens(thisTokens)} of ${formatTokens(headlessTokens)} tokens per page).`
                        : count === 0
                          ? generalCount > 0
                            ? `Reads the page cleanly. ${generalCount} site-wide ${generalCount === 1 ? "issue affects" : "issues affect"} every reader, including this one.`
                            : "Reads the page cleanly."
                          : `${count} reader-specific ${count === 1 ? "finding" : "findings"}.${
                              generalCount > 0
                                ? ` ${generalCount} site-wide ${generalCount === 1 ? "issue affects" : "issues affect"} every reader too.`
                                : ""
                            }`}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
