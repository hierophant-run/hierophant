import { Logo } from "@/components/brand/Logo";
import { CHECK_TABS, checkTabHash } from "@/lib/check-tabs";
import { docsHref, GITHUB_URL, NPM_URL, siteHref, X_URL } from "@/lib/site";
import { FooterWordmark } from "./FooterWordmark";
import { ScanLink } from "./ScanLink";

const linkClass = "text-sm text-muted transition-colors hover:text-text";

export function Footer() {
  return (
    <footer className="mt-28 border-t border-line">
      <div className="mx-auto grid w-full max-w-[1240px] grid-cols-2 gap-8 px-4 py-14 sm:px-8 md:grid-cols-[minmax(0,2fr)_1fr_1fr_1fr]">
        <div className="col-span-2 md:col-span-1">
          <Logo size={32} />
          <p className="mt-4 max-w-xs text-sm leading-6 text-muted">
            Hierophant. Reveals what your agent is about to trust.
          </p>
        </div>

        <nav aria-label="Product">
          <h2 className="font-mono text-xs tracking-[0.14em] text-muted uppercase">Product</h2>
          <ul className="mt-4 space-y-2.5">
            <li>
              <ScanLink plain className={linkClass}>
                Start a check
              </ScanLink>
            </li>
            {CHECK_TABS.map((tab) => (
              <li key={tab.id}>
                <a href={siteHref(`/${checkTabHash(tab.id)}`)} className={linkClass}>
                  {tab.footerLabel}
                </a>
              </li>
            ))}
            <li>
              <a href={siteHref("/#cli")} className={linkClass}>
                Command line
              </a>
            </li>
            <li>
              <a href={siteHref("/token")} className={linkClass}>
                $HIEROPHANT
              </a>
            </li>
          </ul>
        </nav>

        <nav aria-label="Resources">
          <h2 className="font-mono text-xs tracking-[0.14em] text-muted uppercase">Resources</h2>
          <ul className="mt-4 space-y-2.5">
            <li>
              <a href={docsHref()} className={linkClass}>
                Docs
              </a>
            </li>
            <li>
              <a href={siteHref("/#how-it-works")} className={linkClass}>
                How it works
              </a>
            </li>
            <li>
              <a href={docsHref("/rules")} className={linkClass}>
                Rule catalog
              </a>
            </li>
            <li>
              <a href={siteHref("/#rules")} className={linkClass}>
                Supported tools
              </a>
            </li>
            <li>
              <a href={docsHref("/limitations")} className={linkClass}>
                Limitations
              </a>
            </li>
            <li>
              <a href={GITHUB_URL} target="_blank" rel="noreferrer noopener" className={linkClass}>
                GitHub
              </a>
            </li>
            <li>
              <a href={NPM_URL} target="_blank" rel="noreferrer noopener" className={linkClass}>
                npm
              </a>
            </li>
            <li>
              <a href={X_URL} target="_blank" rel="noreferrer noopener" className={linkClass}>
                X
              </a>
            </li>
          </ul>
        </nav>

        <nav aria-label="Legal">
          <h2 className="font-mono text-xs tracking-[0.14em] text-muted uppercase">Legal</h2>
          <ul className="mt-4 space-y-2.5">
            <li>
              <a href={siteHref("/privacy")} className={linkClass}>
                Privacy
              </a>
            </li>
            <li>
              <a href={siteHref("/terms")} className={linkClass}>
                Terms
              </a>
            </li>
            <li>
              <a href={siteHref("/report-policy")} className={linkClass}>
                Report policy
              </a>
            </li>
          </ul>
        </nav>
      </div>

      <div className="relative overflow-hidden" aria-hidden="true">
        <div className="mx-auto w-full max-w-[1240px] px-4 sm:px-8">
          <FooterWordmark />
        </div>
      </div>

      <div className="border-t border-line">
        <div className="mx-auto flex w-full max-w-[1240px] flex-col gap-1 px-4 py-5 text-xs text-muted sm:flex-row sm:justify-between sm:px-8">
          <p>© 2026 Hierophant</p>
          <p>Automated signals, not a guarantee.</p>
        </div>
      </div>
    </footer>
  );
}
