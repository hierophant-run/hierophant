import {
  advisoryUrl,
  PACKAGE_FLAG_LABELS,
  PACKAGE_VERDICT_LABELS,
  packageDisplayName,
  packageUrl,
  type PackageCheck,
  type PackageVerdict,
} from "@hierophant/intel";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { cn } from "@/lib/cn";
import { filePermalink, type ReportView } from "@/server/report-view";

const DOT_CLASSES: Record<PackageVerdict, string> = {
  malicious: "bg-danger",
  not_found: "bg-dot",
  vulnerable: "bg-dot",
  new_package: "bg-dot",
  no_known_issues: "bg-muted",
  unresolved: "bg-muted",
  unavailable: "bg-muted",
};

const linkClass = "underline underline-offset-2 hover:text-text";

function PackageRow({ check, report }: { check: PackageCheck; report: ReportView }) {
  const hidden = check.advisoryCount - check.advisories.length;

  return (
    <li className="min-w-0 px-4 py-4 sm:px-5">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
        <a
          href={packageUrl(check)}
          target="_blank"
          rel="noreferrer noopener"
          className="min-w-0 font-mono text-sm break-all text-text hover:underline"
        >
          {packageDisplayName(check)}
        </a>
        <span
          className={cn(
            "flex shrink-0 items-center gap-2 text-sm",
            check.verdict === "malicious" ? "text-danger" : "text-muted",
          )}
        >
          <span
            aria-hidden="true"
            className={cn("size-1.5 shrink-0 rounded-full", DOT_CLASSES[check.verdict])}
          />
          {PACKAGE_VERDICT_LABELS[check.verdict]}
        </span>
      </div>

      <div className="mt-2 space-y-1 text-xs leading-5 text-muted">
        <p>
          {check.ecosystem}
          {check.flags.map((flag) => ` · ${PACKAGE_FLAG_LABELS[flag]}`).join("")}
        </p>
        {check.advisories.length > 0 ? (
          <p className="break-all">
            {check.advisories.map((id, index) => (
              <span key={id}>
                {index > 0 ? ", " : ""}
                <a
                  href={advisoryUrl(id)}
                  target="_blank"
                  rel="noreferrer noopener"
                  className={linkClass}
                >
                  {id}
                </a>
              </span>
            ))}
            {hidden > 0 ? ` and ${hidden} more` : ""}
          </p>
        ) : null}
        <ul className="font-mono break-all">
          {check.references.map((reference) => (
            <li key={`${reference.path}:${reference.line}`}>
              <a
                href={filePermalink(
                  report.repository.url,
                  report.commit.sha,
                  reference.path,
                  reference.line,
                )}
                target="_blank"
                rel="noreferrer noopener"
                className={linkClass}
              >
                {reference.path}:{reference.line}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </li>
  );
}

export function PackageChecks({ report }: { report: ReportView }) {
  const summary = report.packages;
  if (!summary || summary.checks.length === 0) return null;

  const checkedAt = new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(summary.checkedAt));

  return (
    <section aria-labelledby="packages-title" className="mt-16 sm:mt-20">
      <Eyebrow>Packages</Eyebrow>
      <h2 id="packages-title" className="mt-3 text-2xl font-medium tracking-tight sm:text-4xl">
        Packages this repo would run
      </h2>
      <ul className="mt-6 divide-y divide-line border border-line bg-surface/40">
        {summary.checks.map((check) => (
          <PackageRow
            key={`${check.ecosystem}:${check.name}:${check.requested}`}
            check={check}
            report={report}
          />
        ))}
      </ul>
      <p className="mt-3 text-xs leading-5 text-muted">
        Checked against OSV, npm, and PyPI on {checkedAt} UTC. No known issues does not mean a
        package is harmless.
        {summary.omitted > 0 ? ` ${summary.omitted} more packages were not checked.` : ""}
      </p>
    </section>
  );
}
