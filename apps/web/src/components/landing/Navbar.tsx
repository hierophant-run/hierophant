import { Logo } from "@/components/brand/Logo";
import { CHECK_TABS, checkTabHash } from "@/lib/check-tabs";
import { docsHref, GITHUB_URL, siteHref } from "@/lib/site";
import { HomeLink } from "./HomeLink";
import { ScanLink } from "./ScanLink";

const linkClass = "text-sm text-muted transition-colors hover:text-text";
const mobileLinkClass = `${linkClass} px-2 py-2.5`;

function NavLinks({ className }: { className: string }) {
  return (
    <>
      {CHECK_TABS.map((tab) => (
        <a key={tab.id} href={siteHref(`/${checkTabHash(tab.id)}`)} className={className}>
          {tab.navLabel}
        </a>
      ))}
      <a href={docsHref()} className={className}>
        Docs
      </a>
      <a href={GITHUB_URL} target="_blank" rel="noreferrer noopener" className={className}>
        GitHub
      </a>
      <a href={siteHref("/token")} className={className}>
        $HIEROPHANT
      </a>
    </>
  );
}

export function Navbar() {
  return (
    <header className="fixed inset-x-0 top-0 z-40 border-b border-line/60 bg-bg/75 backdrop-blur-md">
      <div className="mx-auto flex h-16 w-full max-w-[1240px] items-center justify-between gap-4 px-4 sm:px-8">
        <HomeLink className="shrink-0">
          <Logo size={30} />
        </HomeLink>

        <nav aria-label="Main" className="hidden items-center gap-6 lg:flex">
          <NavLinks className={linkClass} />
        </nav>

        <div className="flex items-center gap-2">
          <ScanLink className="min-h-10 px-3.5 max-[379px]:px-2.5 sm:px-4">
            <span className="max-[379px]:hidden">Start a check</span>
            <span className="min-[380px]:hidden">Check</span>
          </ScanLink>
          <details className="relative lg:hidden">
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
              <NavLinks className={mobileLinkClass} />
            </nav>
          </details>
        </div>
      </div>
    </header>
  );
}
