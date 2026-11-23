import type { Metadata } from "next";
import { SiteShell } from "@/components/site/SiteShell";
import { Card } from "@/components/ui/Card";
import { X_HANDLE, X_URL } from "@/lib/site";

const DESCRIPTION = "$HIEROPHANT is coming soon. No token has launched yet.";

export const metadata: Metadata = {
  title: "$HIEROPHANT",
  description: DESCRIPTION,
  alternates: { canonical: "/token" },
};

const rowClass =
  "grid grid-cols-1 gap-1 border-b border-line py-4 last:border-b-0 sm:grid-cols-[200px_minmax(0,1fr)] sm:gap-6";

export default function TokenPage() {
  return (
    <SiteShell>
      <section className="mx-auto max-w-4xl py-6">
        <h1 className="text-[clamp(2.2rem,11.5vw,6rem)] leading-none font-medium tracking-[-0.04em]">
          $HIEROPHANT
        </h1>
        <p className="mt-5 text-2xl font-medium tracking-tight text-dot sm:text-4xl">
          Coming soon.
        </p>

        <Card className="mt-10 p-5 sm:p-8">
          <dl>
            <div className={rowClass}>
              <dt className="text-sm text-muted">Status</dt>
              <dd className="font-mono text-sm">Not launched</dd>
            </div>
            <div className={rowClass}>
              <dt className="text-sm text-muted">Contract address</dt>
              <dd className="font-mono text-sm">Not available yet</dd>
            </div>
            <div className={rowClass}>
              <dt className="text-sm text-muted">Official updates</dt>
              <dd className="font-mono text-sm">
                <a
                  href={X_URL}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="underline underline-offset-2 hover:text-dot"
                >
                  {X_HANDLE}
                </a>
              </dd>
            </div>
          </dl>
        </Card>

        <p className="mt-6 max-w-2xl leading-7 text-muted">
          No $HIEROPHANT token exists yet. Any token using this name today is not ours. The official
          contract address will be posted only on this page and on {X_HANDLE}.
        </p>
        <p className="mt-3 text-sm leading-6 text-muted">
          Nothing on this page is investment advice.
        </p>
      </section>
    </SiteShell>
  );
}
