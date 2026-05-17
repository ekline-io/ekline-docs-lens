import Link from "next/link";
import { bandFor, BAND_CLASSES, type Band } from "@/lib/band";

/**
 * Curated examples surfaced on the homepage. Metadata is hand-typed for now
 * because the underlying scan JSON lives in public/examples/ and the
 * homepage shell is a Client Component (so we can't fs.readFileSync at
 * render). When the maintainer refreshes an example, refresh the row below.
 *
 * Each row links to /scan/example_<slug> which the run-store resolves via
 * loadExample() — that path is the one source of truth for what the
 * visitor sees when they click through.
 */
interface ExampleSpec {
  slug: string;
  host: string;
  failCount: number;
  warnCount: number;
  pages: number;
}

const EXAMPLES: ExampleSpec[] = [
  { slug: "stripe_docs", host: "docs.stripe.com", failCount: 8, warnCount: 5, pages: 10 },
  { slug: "vercel_docs", host: "vercel.com/docs", failCount: 8, warnCount: 6, pages: 10 },
  { slug: "ekline_docs", host: "docs.ekline.io", failCount: 4, warnCount: 4, pages: 10 },
];

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
          {EXAMPLES.map((ex) => {
            const band = bandFor(ex.failCount, ex.warnCount);
            const issues = ex.failCount + ex.warnCount;
            return (
              <Link
                key={ex.slug}
                href={`/scan/example_${ex.slug}`}
                className="card p-5 hover:shadow-card-lift transition-shadow group"
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[14px] font-semibold text-ink truncate">
                    {ex.host}
                  </span>
                  <BandPill band={band} />
                </div>
                <div className="flex items-baseline gap-1 mb-1">
                  <span className="text-[26px] font-bold leading-none text-[color:var(--color-fail-ring)]">
                    {issues}
                  </span>
                  <span className="text-[12px] text-ink/55 mono">
                    {issues === 1 ? "issue" : "issues"}
                  </span>
                </div>
                <div className="text-[11.5px] text-ink/55 mono">
                  {ex.failCount} fail · {ex.warnCount} warn · {ex.pages} pages
                </div>
                <div className="mt-4 text-[12px] text-ink/60 group-hover:text-accent transition-colors inline-flex items-center gap-1">
                  See the full read <span aria-hidden>→</span>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function BandPill({ band }: { band: Band }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10.5px] font-semibold mono ${BAND_CLASSES[band.tone].pill}`}
    >
      {band.label}
    </span>
  );
}
