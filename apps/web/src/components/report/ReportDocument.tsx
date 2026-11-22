import type { AgentImpact, ScanStatus, Severity } from "@hierophant/engine";
import type { ReactNode } from "react";
import { AGENT_LABELS, IMPACT_DOT_CLASSES, IMPACT_LABELS } from "@/components/landing/content";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { cn } from "@/lib/cn";
import { badgeAlt, badgeMarkdown } from "@/server/badge";
import type { ReportFindingView, ReportView } from "@/server/report-view";
import { BadgeSnippet } from "./BadgeSnippet";
import { CopyLinkButton } from "./CopyLinkButton";
import { FeedbackControl } from "./FeedbackControl";
import { FindingExcerpt } from "./FindingExcerpt";
import { openingSteps } from "./guidance";
import { PackageChecks } from "./PackageChecks";

const SEVERITY_ORDER: Severity[] = ["critical", "high", "medium", "low"];

const SEVERITY_STYLES: Record<Severity, { label: string; classes: string }> = {
  critical: { label: "Critical", classes: "border-danger bg-danger/10 text-danger" },
  high: { label: "High", classes: "border-danger/70 text-danger" },
  medium: { label: "Medium", classes: "border-dot/70 text-dot" },
  low: { label: "Low", classes: "border-line text-muted" },
};

const STATUS_STYLES: Record<ScanStatus, { label: string; color: string; icon: ReactNode }> = {
  dangerous: {
    label: "Dangerous",
    color: "text-danger",
    icon: (
      <>
        <path d="M8 2 15 14H1L8 2Z" />
        <path d="M8 6.5v3.5M8 12h.01" />
      </>
    ),
  },
  needs_review: {
    label: "Needs review",
    color: "text-dot",
    icon: (
      <>
        <circle cx="8" cy="8" r="6.5" />
        <path d="M6.2 6.2a1.9 1.9 0 1 1 2.9 1.6c-.7.4-1.1.8-1.1 1.6M8 11.7h.01" />
      </>
    ),
  },
  no_issues_found: {
    label: "No issues found",
    color: "text-text",
    icon: (
      <>
        <circle cx="7" cy="7" r="5" />
        <path d="m11 11 3.5 3.5" />
      </>
    ),
  },
};

function statusSummary(report: ReportView): string {
  if (report.noAgentFiles) {
    return "This repository has no agent files for Hierophant to inspect.";
  }
  if (report.status === "dangerous") {
    return "This repo has high-risk findings. Do not trust it until you have reviewed them.";
  }
  if (report.status === "needs_review") {
    return "Hierophant found items worth checking before you trust this repo.";
  }
  if (report.skipped.some((entry) => entry.path === ".")) {
    return "None of the current rules matched the files that were checked. Part of this repo was not checked, as listed below.";
  }
  return "None of the current rules matched the agent files in this repo.";
}

function formatScanTime(iso: string): string {
  const formatted = new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(iso));
  return `${formatted} UTC`;
}

function ExternalLink({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <a href={href} target="_blank" rel="noreferrer noopener" className={className}>
      {children}
    </a>
  );
}

function SectionHeading({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div>
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 className="mt-3 text-2xl font-medium tracking-tight sm:text-4xl">{title}</h2>
    </div>
  );
}

function StatusPanel({ report }: { report: ReportView }) {
  const style = STATUS_STYLES[report.status];
  const counts = SEVERITY_ORDER.flatMap((severity) => {
    const count = report.findings.filter((finding) => finding.severity === severity).length;
    return count > 0 ? [`${count} ${SEVERITY_STYLES[severity].label.toLowerCase()}`] : [];
  });

  return (
    <Card className="mt-8 bg-linear-to-b from-surface to-bg p-6 sm:p-10">
      <Eyebrow>Verdict</Eyebrow>
      <div className={cn("mt-4 flex items-center gap-3 sm:gap-4", style.color)}>
        <svg
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.25"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-8 shrink-0 sm:size-12"
          aria-hidden="true"
        >
          {style.icon}
        </svg>
        <p className="text-4xl font-medium tracking-[-0.025em] sm:text-6xl">{style.label}</p>
      </div>
      <p className="mt-4 max-w-2xl leading-7 text-muted">{statusSummary(report)}</p>
      {counts.length > 0 ? (
        <p className="mt-3 font-mono text-xs text-muted">{counts.join(" · ")}</p>
      ) : null}
    </Card>
  );
}

function AgentRow({ entry, report }: { entry: AgentImpact; report: ReportView }) {
  const label = (
    <>
      <span className="font-medium">{AGENT_LABELS[entry.agent]}</span>
      <span className="flex items-center gap-2 text-sm text-muted">
        <span
          aria-hidden="true"
          className={cn("size-1.5 shrink-0 rounded-full", IMPACT_DOT_CLASSES[entry.impact])}
        />
        {IMPACT_LABELS[entry.impact]}
      </span>
    </>
  );

  if (entry.findings.length === 0) {
    return (
      <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-4 sm:px-5">
        {label}
      </li>
    );
  }

  const notes = [
    ...new Map(entry.findings.map((finding) => [finding.note, finding.source])).entries(),
  ];

  return (
    <li>
      <details className="group">
        <summary className="flex min-h-14 cursor-pointer list-none flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-4 transition-colors hover:bg-surface sm:px-5 [&::-webkit-details-marker]:hidden">
          {label}
          <span className="flex w-full items-center justify-between gap-2 font-mono text-xs text-muted sm:ml-auto sm:w-auto sm:pl-4">
            {entry.findings.length} {entry.findings.length === 1 ? "finding" : "findings"}
            <svg
              width="12"
              height="12"
              viewBox="0 0 12 12"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="transition-transform group-open:rotate-180"
              aria-hidden="true"
            >
              <path d="m2.5 4.5 3.5 3.5 3.5-3.5" />
            </svg>
          </span>
        </summary>
        <div className="border-t border-line bg-bg/40 px-4 py-4 sm:px-5">
          <ul className="space-y-2">
            {notes.map(([note, source]) => (
              <li key={note} className="text-sm leading-6 text-muted">
                {note}{" "}
                {source ? (
                  <ExternalLink
                    href={source}
                    className="whitespace-nowrap underline underline-offset-2 hover:text-text"
                  >
                    Official docs
                  </ExternalLink>
                ) : null}
              </li>
            ))}
          </ul>
          <ul className="mt-3 space-y-1">
            {entry.findings.map((finding) => {
              const match = report.findings.find(
                (candidate) =>
                  candidate.ruleId === finding.ruleId &&
                  candidate.path === finding.path &&
                  candidate.line === finding.line,
              );
              const text = `${finding.path}:${finding.line}`;
              return (
                <li
                  key={`${finding.ruleId}:${text}`}
                  className="font-mono text-xs break-all text-muted"
                >
                  {match ? (
                    <a
                      href={`#finding-${match.position}`}
                      className="underline underline-offset-2 hover:text-text"
                    >
                      {text}
                    </a>
                  ) : (
                    text
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </details>
    </li>
  );
}

function FindingCard({ finding, reportId }: { finding: ReportFindingView; reportId: string }) {
  const severity = SEVERITY_STYLES[finding.severity];

  return (
    <li id={`finding-${finding.position}`} className="min-w-0 scroll-mt-24">
      <Card className="p-5 sm:p-7">
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn("border px-2 py-0.5 text-xs font-medium", severity.classes)}>
            {severity.label}
          </span>
          <span className="font-mono text-xs text-muted">{finding.ruleId}</span>
        </div>
        <h3 className="mt-3 text-lg font-medium tracking-tight sm:text-xl">{finding.title}</h3>
        <ExternalLink
          href={finding.permalink}
          className="mt-1.5 inline-block max-w-full font-mono text-xs break-all text-muted underline underline-offset-2 hover:text-text sm:text-sm"
        >
          {finding.path}:{finding.line}
        </ExternalLink>

        <FindingExcerpt
          reportId={reportId}
          ruleId={finding.ruleId}
          path={finding.path}
          line={finding.line}
        />

        <dl className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-2 md:gap-8">
          <div>
            <dt className="text-sm font-medium">Why it matters</dt>
            <dd className="mt-1 text-sm leading-6 text-muted">{finding.why}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium">How to fix it</dt>
            <dd className="mt-1 text-sm leading-6 text-muted">{finding.fix}</dd>
          </div>
        </dl>
        <FeedbackControl reportId={reportId} position={finding.position} />
      </Card>
    </li>
  );
}

export function ReportDocument({ report }: { report: ReportView }) {
  const steps = openingSteps(report);

  return (
    <article className="min-w-0">
      <header className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <Eyebrow>Open Impact Report</Eyebrow>
          <h1 className="mt-3 text-3xl font-medium tracking-[-0.025em] break-words sm:text-5xl">
            <ExternalLink href={report.repository.url} className="hover:underline">
              {report.repository.owner}/{report.repository.name}
            </ExternalLink>
          </h1>
          <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-2 font-mono text-xs text-muted">
            <div className="flex gap-1.5">
              <dt>Commit</dt>
              <dd>
                <ExternalLink
                  href={report.commit.url}
                  className="text-text underline underline-offset-2"
                >
                  {report.commit.shortSha}
                </ExternalLink>
              </dd>
            </div>
            <div className="flex gap-1.5">
              <dt>Scanned</dt>
              <dd className="text-text">
                <time dateTime={report.scannedAt}>{formatScanTime(report.scannedAt)}</time>
              </dd>
            </div>
            <div className="flex gap-1.5">
              <dt>Ruleset</dt>
              <dd className="text-text">v{report.rulesetVersion}</dd>
            </div>
            <div className="flex gap-1.5">
              <dt>Agent files</dt>
              <dd className="text-text">{report.filesScanned}</dd>
            </div>
          </dl>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <CopyLinkButton />
          <Button href="/#scan-url" variant="secondary">
            Scan another repo
          </Button>
        </div>
      </header>

      <StatusPanel report={report} />

      <section aria-labelledby="impact-title" className="mt-16 sm:mt-20">
        <div>
          <Eyebrow>Open Impact</Eyebrow>
          <h2 id="impact-title" className="mt-3 text-2xl font-medium tracking-tight sm:text-4xl">
            What happens in each agent
          </h2>
        </div>
        <ul className="mt-6 divide-y divide-line border border-line bg-surface/40">
          {report.impact.map((entry) => (
            <AgentRow key={entry.agent} entry={entry} report={report} />
          ))}
        </ul>
      </section>

      <PackageChecks report={report} />

      <section className="mt-16 sm:mt-20">
        <SectionHeading
          eyebrow="Findings"
          title={report.findings.length === 1 ? "1 finding" : `${report.findings.length} findings`}
        />
        {report.findings.length > 0 ? (
          <ol className="mt-6 space-y-4">
            {report.findings.map((finding) => (
              <FindingCard key={finding.position} finding={finding} reportId={report.id} />
            ))}
          </ol>
        ) : (
          <Card className="mt-6">
            <p className="leading-7 text-muted">{report.disclaimer}</p>
          </Card>
        )}
      </section>

      {report.status !== "no_issues_found" ? (
        <section className="mt-16 sm:mt-20">
          <SectionHeading eyebrow="Before you open it" title="Open this repo with less risk" />
          <ol className="mt-6 grid grid-cols-1 gap-x-8 md:grid-cols-2">
            {steps.map((step, index) => (
              <li key={step.title} className="flex gap-4 border-t border-line py-4">
                <span className="font-mono text-xs leading-6 text-dot">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div>
                  <h3 className="font-medium">{step.title}</h3>
                  <p className="mt-1 text-sm leading-6 text-muted">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {report.skipped.length > 0 ? (
        <section aria-labelledby="skipped-title" className="mt-12">
          <details className="group border border-line">
            <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-4 px-4 py-3 hover:bg-surface sm:px-5 [&::-webkit-details-marker]:hidden">
              <h2 id="skipped-title" className="text-sm font-medium">
                Files not fully checked ({report.skipped.length})
              </h2>
              <svg
                width="12"
                height="12"
                viewBox="0 0 12 12"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="shrink-0 text-muted transition-transform group-open:rotate-180"
                aria-hidden="true"
              >
                <path d="m2.5 4.5 3.5 3.5 3.5-3.5" />
              </svg>
            </summary>
            <ul className="divide-y divide-line border-t border-line">
              {report.skipped.map((entry) => (
                <li
                  key={`${entry.path}:${entry.reason}`}
                  className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:justify-between sm:gap-6 sm:px-5"
                >
                  <span className="font-mono text-xs break-all text-text">
                    {entry.path === "." ? "Repository" : entry.path}
                  </span>
                  <span className="text-xs text-muted sm:text-right">{entry.reason}</span>
                </li>
              ))}
            </ul>
          </details>
        </section>
      ) : null}

      <section className="mt-16 sm:mt-20">
        <SectionHeading eyebrow="Badge" title="Show this result in your README" />
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">
          The badge shows this status, ruleset, and commit, and links to this report.
        </p>
        <BadgeSnippet
          badgeSrc={`/api/badge/${report.id}`}
          markdown={badgeMarkdown(report.id)}
          alt={badgeAlt(report.status, report.rulesetVersion)}
        />
      </section>

      <p className="mt-10 border-t border-line pt-5 text-sm leading-6 text-muted">
        {report.disclaimer}
      </p>
    </article>
  );
}
