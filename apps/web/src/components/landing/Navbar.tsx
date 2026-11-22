import { Logo } from "@/components/brand/Logo";
import { docsHref, siteHref } from "@/lib/site";
import { ScanLink } from "./ScanLink";

const linkClass = "text-sm text-muted transition-colors hover:text-text";

export function Navbar() {
  return (
    <header className="fixed inset-x-0 top-0 z-40 border-b border-line/60 bg-bg/75 backdrop-blur-md">
      <div className="mx-auto flex h-16 w-full max-w-[1240px] items-center justify-between gap-4 px-4 sm:px-8">
        <a href={siteHref("/#top")} className="shrink-0">
          <Logo size={30} />
        </a>

        <nav aria-label="Main" className="hidden items-center gap-7 md:flex">
          <a href={siteHref("/#how-it-works")} className={linkClass}>
            How it works
          </a>
          <a href={siteHref("/#rules")} className={linkClass}>
            Rules
          </a>
          <a href={docsHref()} className={linkClass}>
            Docs
          </a>
        </nav>

        <div className="flex items-center gap-2">
          <ScanLink className="min-h-10 px-3.5 sm:px-4">Scan a repo</ScanLink>
          <details className="relative md:hidden">
            <summary
              aria-label="Open menu"
              className="flex size-10 cursor-pointer list-none items-center justify-center rounded-[3px] border border-line text-text [&::-webkit-details-marker]:hidden"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path d="M2 4.5h12M2 8h12M2 11.5h12" />
              </svg>
            </summary>
            <nav
              aria-label="Mobile"
              className="absolute top-12 right-0 flex w-48 flex-col border border-line bg-surface p-2"
            >
              <a href={siteHref("/#how-it-works")} className={`${linkClass} px-2 py-2.5`}>
                How it works
              </a>
              <a href={siteHref("/#rules")} className={`${linkClass} px-2 py-2.5`}>
                Rules
              </a>
              <a href={docsHref()} className={`${linkClass} px-2 py-2.5`}>
                Docs
              </a>
            </nav>
          </details>
        </div>
      </div>
    </header>
  );
}
