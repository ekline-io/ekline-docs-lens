import Link from "next/link";

/**
 * Curated example scans surfaced on the homepage. Each entry maps to a JSON
 * file in `public/examples/<slug>.json` that the run-store rehydrates as a
 * normal scan record when the user clicks through. Updated by hand when the
 * maintainer wants to refresh the set — see the KV migration issue for the
 * automatic "Recent scans" successor.
 */
const EXAMPLES: ExampleEntry[] = [
  {
    slug: "stripe_docs",
    host: "docs.stripe.com",
    band: { label: "Broken for agents", tone: "alert" },
    issues: 11,
    failCount: 5,
    warnCount: 6,
    pages: 10,
  },
  {
    slug: "vercel_docs",
    host: "vercel.com/docs",
    band: { label: "Broken for agents", tone: "alert" },
    issues: 11,
    failCount: 7,
    warnCount: 4,
    pages: 10,
  },
  {
    slug: "ekline_docs",
    host: "docs.ekline.io",
    band: { label: "Broken for agents", tone: "alert" },
    issues: 8,
    failCount: 4,
    warnCount: 4,
    pages: 10,
  },
];

interface ExampleEntry {
  slug: string;
  host: string;
  band: { label: string; tone: "ok" | "warn" | "alert" };
  issues: number;
  failCount: number;
  warnCount: number;
  pages: number;
}

export function HomepageExamples() {
  return (
    <section className="px-6 pb-20">
      <div className="max-w-[1100px] mx-auto">
        <div className="flex items-baseline gap-3 mb-5 flex-wrap">
          <span className="text-[11px] uppercase tracking-[0.12em] text-ink/50 mono">
            Example scans
          </span>
          <span className="text-[12.5px] text-ink/55">
            Real scans we ran on well-known docs sites. Click through to see
            what each agent reader got.
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {EXAMPLES.map((ex) => (
            <Link
              key={ex.slug}
              href={`/scan/example_${ex.slug}`}
              className="card p-5 hover:shadow-card-lift transition-shadow group"
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-[14px] font-semibold text-ink truncate">
                  {ex.host}
                </span>
                <BandPill band={ex.band} />
              </div>
              <div className="flex items-baseline gap-1 mb-1">
                <span className="text-[26px] font-bold leading-none text-[color:var(--color-fail-ring)]">
                  {ex.issues}
                </span>
                <span className="text-[12px] text-ink/55 mono">
                  {ex.issues === 1 ? "issue" : "issues"}
                </span>
              </div>
              <div className="text-[11.5px] text-ink/55 mono">
                {ex.failCount} fail · {ex.warnCount} warn · {ex.pages} pages
              </div>
              <div className="mt-4 text-[12px] text-ink/60 group-hover:text-accent transition-colors inline-flex items-center gap-1">
                See the full read <span aria-hidden>→</span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

function BandPill({
  band,
}: {
  band: { label: string; tone: "ok" | "warn" | "alert" };
}) {
  const tone =
    band.tone === "ok"
      ? "bg-emerald-50 text-emerald-800 border-emerald-200"
      : band.tone === "warn"
        ? "bg-amber-50 text-amber-800 border-amber-200"
        : "bg-rose-50 text-rose-800 border-rose-200";
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10.5px] font-semibold mono ${tone}`}
    >
      {band.label}
    </span>
  );
}
