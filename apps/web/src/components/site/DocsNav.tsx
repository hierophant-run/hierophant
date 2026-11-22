"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { docsHref } from "@/lib/site";

const LINKS = [
  { path: "", label: "Quickstart" },
  { path: "/how-it-works", label: "How it works" },
  { path: "/rules", label: "Rule catalog" },
  { path: "/limitations", label: "Limitations" },
  { path: "/false-positives", label: "False positives" },
];

export function DocsNav() {
  const pathname = usePathname();
  // The docs subdomain serves /rules from /docs/rules, so both forms must match the same link.
  const current = pathname.replace(/^\/docs(?=\/|$)/, "").replace(/\/$/, "");

  return (
    <nav aria-label="Documentation" className="lg:sticky lg:top-28 lg:self-start">
      <ul className="flex flex-wrap gap-x-5 gap-y-1 border-b border-line pb-3 lg:flex-col lg:border-b-0 lg:pb-0">
        {LINKS.map((link) => {
          const isCurrent = current === link.path;
          return (
            <li key={link.path}>
              <Link
                href={docsHref(link.path)}
                aria-current={isCurrent ? "page" : undefined}
                className={`inline-flex min-h-9 items-center text-sm transition-colors hover:text-text ${isCurrent ? "text-text" : "text-muted"}`}
              >
                {link.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
