import type { ScanStatus } from "@hierophant/engine";
import { BadgeSnippet } from "@/components/report/BadgeSnippet";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { WatchStartButton } from "@/components/watch/WatchStartButton";
import { checkPath } from "@/lib/check-target";
import { cn } from "@/lib/cn";
import { checkBadgeMarkdown, checkBadgePath, type CheckResult } from "@/server/checks";
import type { CheckInspection, CheckSignal } from "@/server/checks/common";
import { DetailRows } from "./DetailRows";
import { TokenMarketData } from "./TokenMarketData";

const STATUS_COLORS: Record<ScanStatus, string> = {
  dangerous: "text-danger",
  needs_review: "text-dot",
  no_issues_found: "text-text",
};

const SEVERITY: Record<CheckSignal["severity"], { label: string; classes: string }> = {
  critical: { label: "Critical", classes: "border-danger bg-danger/10 text-danger" },
  high: { label: "High", classes: "border-danger/70 text-danger" },
  medium: { label: "Medium", classes: "border-dot/70 text-dot" },
  low: { label: "Low", classes: "border-line text-muted" },
  info: { label: "Info", classes: "border-line text-muted" },
};

const externalLinkClass =
  "inline-block max-w-full text-muted underline underline-offset-2 hover:text-text";

function SignalCard({ signal }: { signal: CheckSignal }) {
  const severity = SEVERITY[signal.severity];
  return (
    <li className="min-w-0">
      <Card className="p-5 sm:p-6">
        <span className={cn("border px-2 py-0.5 text-xs font-medium", severity.classes)}>
          {severity.label}
        </span>
        <h3 className="mt-3 text-lg font-medium tracking-tight break-words">{signal.title}</h3>
        {signal.location && signal.href ? (
          <a
            href={signal.href}
            target="_blank"
            rel="noreferrer noopener"
            className={cn(externalLinkClass, "mt-1 font-mono text-xs break-all")}
          >
            {signal.location}
          </a>
        ) : null}
        {signal.location && !signal.href ? (
          <p className="mt-1 font-mono text-xs break-all text-muted">{signal.location}</p>
        ) : null}
        <p className="mt-3 text-sm leading-6 break-words text-muted">{signal.detail}</p>
        {signal.href && !signal.location ? (
          <a
            href={signal.href}
            target="_blank"
            rel="noreferrer noopener"
            className={cn(externalLinkClass, "mt-2 text-sm")}
          >
            View advisory
          </a>
        ) : null}
      </Card>
    </li>
  );
}

function ScopeList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="border-t border-line pt-4">
      <h3 className="font-medium">{title}</h3>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-muted">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function InspectionRows({ items }: { items: CheckInspection[] }) {
  return (
    <ul className="mt-6 border-t border-line">
      {items.map((item) => (
        <li
          key={item.label}
          className="flex items-center justify-between gap-4 border-b border-line py-3"
        >
          <span className="text-sm">{item.label}</span>
          <span
            className={cn(
              "shrink-0 border px-2 py-0.5 text-xs font-medium",
              item.isFound ? "border-danger text-danger" : "border-line text-muted",
            )}
          >
            {item.isFound ? "Found" : "None found"}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function CheckDocument({ result }: { result: CheckResult }) {
  const isToken = result.target.kind === "token";
  const details = result.tokenDetails;
  const checkedAt = new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(result.checkedAt));

  return (
    <article className="min-w-0">
      <header className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <Eyebrow>{result.kindLabel}</Eyebrow>
          <h1 className="mt-3 text-3xl font-medium tracking-[-0.025em] break-words sm:text-5xl">
            <a
              href={result.sourceUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="hover:underline"
            >
              {result.name}
            </a>
          </h1>
          <p className="mt-3 font-mono text-xs break-all text-muted">{result.subtitle}</p>
          <p className="mt-1 font-mono text-xs text-muted">
            Ruleset v{result.rulesetVersion} · Checked {checkedAt} UTC
          </p>
        </div>
        <Button href="/check" variant="secondary" className="shrink-0 self-start">
          Check another
        </Button>
      </header>

      <Card className="mt-8 bg-linear-to-b from-surface to-bg p-6 sm:p-10">
        <Eyebrow>Verdict</Eyebrow>
        <p
          className={cn(
            "mt-4 text-4xl font-medium tracking-[-0.025em] sm:text-6xl",
            STATUS_COLORS[result.status],
          )}
        >
          {result.statusLabel}
        </p>
        <p className="mt-4 max-w-2xl leading-7 text-muted">{result.notice}</p>
      </Card>

      {details ? (
        <div className="mt-14 grid grid-cols-1 gap-12 lg:grid-cols-2">
          <section aria-labelledby="read-title" className="min-w-0">
            <Eyebrow>Evidence</Eyebrow>
            <h2 id="read-title" className="mt-3 text-2xl font-medium tracking-tight sm:text-4xl">
              What was read
            </h2>
            <DetailRows rows={details.text} />
          </section>
          <section aria-labelledby="inspected-title" className="min-w-0">
            <Eyebrow>Inspection</Eyebrow>
            <h2
              id="inspected-title"
              className="mt-3 text-2xl font-medium tracking-tight sm:text-4xl"
            >
              What was inspected
            </h2>
            <InspectionRows items={details.inspections} />
          </section>
        </div>
      ) : null}

      <section aria-labelledby="signals-title" className="mt-14">
        <Eyebrow>Signals</Eyebrow>
        <h2 id="signals-title" className="mt-3 text-2xl font-medium tracking-tight sm:text-4xl">
          {result.signals.length === 1 ? "1 signal" : `${result.signals.length} signals`}
        </h2>
        {result.signals.length > 0 ? (
          <ol className="mt-6 space-y-4">
            {result.signals.map((signal) => (
              <SignalCard key={`${signal.title}:${signal.location ?? ""}`} signal={signal} />
            ))}
          </ol>
        ) : (
          <p className="mt-4 leading-7 text-muted">The current checks raised no signals.</p>
        )}
      </section>

      {result.target.kind === "token" ? (
        <TokenMarketData chain={result.target.chain} address={result.target.address} />
      ) : null}

      <section aria-labelledby="scope-title" className="mt-14">
        <Eyebrow>Scope</Eyebrow>
        <h2 id="scope-title" className="mt-3 text-2xl font-medium tracking-tight sm:text-4xl">
          What this covers
        </h2>
        <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
          <ScopeList title="Checked" items={result.checked} />
          <ScopeList title="Not checked" items={result.notChecked} />
        </div>
      </section>

      {result.target.kind === "mcp" || result.target.kind === "skill" ? (
        <section aria-labelledby="watch-title" className="mt-14">
          <Eyebrow>Monitoring</Eyebrow>
          <h2 id="watch-title" className="mt-3 text-2xl font-medium tracking-tight sm:text-4xl">
            Watch this for changes
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">
            {result.target.kind === "mcp"
              ? "Hierophant checks the official MCP Registry record about every 30 minutes. When the version, launch packages, or hosts change, it checks the server again and adds the result to a feed you can follow."
              : "Hierophant checks this skill folder about every 30 minutes. When a file in it changes, it checks the skill again and adds the result to a feed you can follow."}{" "}
            No account is needed.
          </p>
          <WatchStartButton body={{ check: checkPath(result.target) }} />
        </section>
      ) : null}

      <section className="mt-14">
        <Eyebrow>Badge</Eyebrow>
        <h2 className="mt-3 text-2xl font-medium tracking-tight sm:text-4xl">
          Show this check in a README
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">
          {isToken
            ? "This badge only describes the token's on-chain text. Do not present it as a safety rating."
            : "The badge shows the current status and ruleset, and links to this result."}
        </p>
        <BadgeSnippet
          badgeSrc={checkBadgePath(result.target)}
          markdown={checkBadgeMarkdown(result)}
          alt={`${isToken ? "Token metadata" : "Checked by Hierophant"}: ${result.statusLabel}`}
        />
      </section>
    </article>
  );
}
