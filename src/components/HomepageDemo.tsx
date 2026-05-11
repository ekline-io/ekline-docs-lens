"use client";

import { useState } from "react";

const SAMPLE = {
  rendered: {
    title: "Charges API",
    body: "The Charges resource lets you accept payments. Authenticate with your API key, then POST to /v1/charges with amount, currency, and source.",
  },
  rawHttp: `Title: Charges API · Stripe
Description: Create, retrieve, and refund charges.

# Charges API

The Charges resource lets you accept payments...

(markdown was truncated at 100 KB by Claude Code's WebFetch pipeline)`,
  headless: `# Charges API

The Charges resource lets you accept payments. Authenticate with your API key, then POST to /v1/charges with amount, currency, and source.

[Try it →]
[See response shape →]
[Edit on GitHub →]

(full DOM after JS execution; ~12 KB markdown)`,
  snippet: `Title: Charges API · Stripe
Description: Create, retrieve, and refund charges.
og:title: Charges API
og:description: Stripe Charges reference.
og:image: https://stripe.com/og.png
First H1: Charges API

Preview (200 chars):
The Charges resource lets you accept payments. Authenticate with your API key, then POST to /v1/charges with amount, currency, and source.`,
};

type TabId = "rawHttp" | "headless" | "snippet";

const TABS: ReadonlyArray<{
  id: TabId;
  label: string;
  who: string;
}> = [
  { id: "rawHttp", label: "Raw HTTP", who: "Claude Code · Cursor · Continue" },
  { id: "headless", label: "Headless browser", who: "ChatGPT Atlas · Perplexity Comet · Cline" },
  { id: "snippet", label: "Search snippet", who: "ChatGPT Search · Perplexity · You.com" },
];

export function HomepageDemo() {
  const [active, setActive] = useState<TabId>("rawHttp");

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-12 max-w-4xl mx-auto text-left">
      <div className="border border-rule rounded-lg p-4 bg-paper-dim/30">
        <div className="text-[11px] uppercase tracking-wide text-ink/50 mb-2">
          What you see
        </div>
        <div className="font-bold text-lg mb-2">{SAMPLE.rendered.title}</div>
        <p className="text-[14px] text-ink/80 leading-relaxed">{SAMPLE.rendered.body}</p>
        <div className="mt-3 flex gap-2 text-[11px] text-ink/50">
          <span>[Try it]</span>
          <span>[See response]</span>
          <span>[Edit on GitHub]</span>
        </div>
      </div>
      <div className="border border-rule rounded-lg bg-paper-dim/30 overflow-hidden">
        <div className="flex border-b border-rule">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActive(t.id)}
              className={`flex-1 px-3 py-2 text-[12px] font-medium border-r border-rule last:border-r-0 ${
                active === t.id ? "bg-paper text-ink" : "text-ink/60 hover:text-ink"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="p-4">
          <div className="text-[11px] uppercase tracking-wide text-ink/50 mb-2">
            What {TABS.find((t) => t.id === active)?.who} see
          </div>
          <pre className="whitespace-pre-wrap text-[12px] text-ink/80 leading-relaxed font-mono">
            {SAMPLE[active]}
          </pre>
        </div>
      </div>
    </div>
  );
}
