import type { ReactNode } from "react";
import { Card } from "@/components/ui/Card";
import { X_HANDLE, X_URL } from "@/lib/site";
import type { TokenLaunch } from "@/lib/token-launch";
import { TokenAddress } from "./TokenAddress";

const rowClass =
  "grid grid-cols-1 gap-1 border-b border-line py-4 last:border-b-0 sm:grid-cols-[200px_minmax(0,1fr)] sm:gap-6";
const linkClass = "underline underline-offset-2 hover:text-dot";

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={rowClass}>
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="min-w-0 font-mono text-sm">{children}</dd>
    </div>
  );
}

function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer noopener" className={linkClass}>
      {children}
    </a>
  );
}

export function tokenDescription(launch: TokenLaunch | null) {
  return launch
    ? `The official $HIEROPHANT contract address on ${launch.network}.`
    : "$HIEROPHANT is coming soon. No token has launched yet.";
}

export function TokenView({ launch }: { launch: TokenLaunch | null }) {
  return (
    <section className="mx-auto max-w-4xl py-6">
      <h1 className="text-[clamp(2.2rem,11.5vw,6rem)] leading-none font-medium tracking-[-0.04em]">
        $HIEROPHANT
      </h1>
      <p className="mt-5 text-2xl font-medium tracking-tight text-dot sm:text-4xl">
        {launch ? `Live on ${launch.network}.` : "Coming soon."}
      </p>

      <Card className="mt-10 p-5 sm:p-8">
        <dl>
          {launch ? (
            <>
              <Row label="Status">Live</Row>
              <Row label="Network">{launch.network}</Row>
              <Row label="Contract address">
                <TokenAddress address={launch.address} />
              </Row>
              <Row label="Block explorer">
                <ExternalLink href={launch.explorerUrl}>View the contract</ExternalLink>
              </Row>
              {launch.launchUrl ? (
                <Row label="Launch page">
                  <ExternalLink href={launch.launchUrl}>
                    {launch.launchLabel ?? "View the launch page"}
                  </ExternalLink>
                </Row>
              ) : null}
            </>
          ) : (
            <>
              <Row label="Status">Not launched</Row>
              <Row label="Contract address">Not available yet</Row>
            </>
          )}
          <Row label="Official updates">
            <ExternalLink href={X_URL}>{X_HANDLE}</ExternalLink>
          </Row>
        </dl>
      </Card>

      {launch ? (
        <>
          <p className="mt-6 max-w-2xl leading-7 text-muted">
            This is the only official $HIEROPHANT contract. Any other token using this name is not
            ours. Compare every character with the address in our official post on {X_HANDLE}.
          </p>
          <p className="mt-3 text-sm leading-6 text-muted">
            $HIEROPHANT has no utility. Nothing on this page is investment advice.
          </p>
        </>
      ) : (
        <>
          <p className="mt-6 max-w-2xl leading-7 text-muted">
            No $HIEROPHANT token exists yet. Any token using this name today is not ours. The
            official contract address will be posted only on this page and on {X_HANDLE}.
          </p>
          <p className="mt-3 text-sm leading-6 text-muted">
            Nothing on this page is investment advice.
          </p>
        </>
      )}
    </section>
  );
}
