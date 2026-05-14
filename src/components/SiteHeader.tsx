"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { GitHubLink } from "@/components/GitHubLink";

const NAV_ITEMS = [
  { href: "/why", label: "Why this exists" },
  { href: "/methodology", label: "Methodology" },
] as const;

export function SiteHeader() {
  const pathname = usePathname();
  return (
    <section className="bg-paper-dim/50 border-b border-rule">
      <div className="max-w-[1200px] mx-auto px-6 py-3 flex items-center gap-4 flex-wrap">
        <Link href="/" className="flex items-center gap-2.5 shrink-0">
          <span className="inline-block w-2 h-2 rounded-sm bg-accent" />
          <span className="text-[15px] font-bold tracking-tight h-navy">Docs Lens</span>
        </Link>
        <nav className="flex items-center gap-2 ml-auto shrink-0">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={
                  active
                    ? "btn-subtle bg-paper-dim border-ink/30 text-ink font-semibold"
                    : "btn-subtle"
                }
              >
                {item.label}
              </Link>
            );
          })}
          <GitHubLink />
        </nav>
      </div>
    </section>
  );
}
