import type { ScanStatus } from "@hierophant/engine";
import { BadgeSnippet } from "@/components/report/BadgeSnippet";
import { Card } from "@/components/ui/Card";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { cn } from "@/lib/cn";
import { SITE_URL } from "@/lib/site";
import { watchBadgeMarkdown } from "@/server/badge";
import { CHECK_INTERVAL_MS } from "@/server/monitor-service";
import type { MonitorEvent } from "@/server/monitor-store";
import { describeChange, eventResult, watchPath, type WatchData } from "@/server/watch-view";
import { CopyField } from "./CopyField";

const STATUS_TEXT: Record<ScanStatus, string> = {
  dangerous: "text-danger",
  needs_review: "text-dot",
  no_issues_found: "text-text",
};
const STATUS_LABEL: Record<ScanStatus, string> = {
  dangerous: "Dangerous",
  needs_review: "Needs review",
  no_issues_found: "No issues found",
};

const formatDate = (date: Date) =>
  `${new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(date)} UTC`;

function PathList({ label, paths }: { label: string; paths: string[] }) {
  if (paths.length === 0) return null;
  return (
    <div className="min-w-0">
      <p className="font-mono text-xs tracking-[0.12em] text-muted uppercase">{label}</p>
      <ul className="mt-1 space-y-0.5">
        {paths.map((path) => (
          <li key={path} className="font-mono text-sm break-all text-text">
            {path}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ChangeItem({ event }: { event: MonitorEvent }) {
  const result = eventResult(event);
  return (
    <li className="min-w-0">
      <Card className="p-5 sm:p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h3 className="text-lg font-medium">{describeChange(event)}</h3>
            <p className="mt-1 font-mono text-xs text-muted">
              Commit {event.commitSha.slice(0, 7)} · Found {formatDate(event.createdAt)}
            </p>
          </div>
          <p
            className={cn(
              "shrink-0 font-medium",
              event.status ? STATUS_TEXT[event.status] : "text-muted",
            )}
          >
            {result}
          </p>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
          <PathList label="Added" paths={event.added} />
          <PathList label="Changed" paths={event.changed} />
          <PathList label="Removed" paths={event.removed} />
        </div>
        {event.reportId ? (
          <a
            href={`/r/${event.reportId}`}
            className="mt-4 inline-block text-sm text-text underline underline-offset-2 hover:text-dot"
          >
            View the report for this commit
          </a>
        ) : null}
      </Card>
    </li>
  );
}

export function WatchDocument({ data }: { data: WatchData }) {
  const { monitor, events, latest } = data;
  const name = `${monitor.owner}/${monitor.repo}`;
  const feedUrl = `${SITE_URL}${watchPath(monitor)}/feed.xml`;
  const minutes = Math.round(CHECK_INTERVAL_MS / 60000);

  return (
    <article className="min-w-0">
      <Eyebrow>Monitoring</Eyebrow>
      <h1 className="mt-3 text-3xl font-medium tracking-[-0.025em] break-words sm:text-5xl">
        {name}
      </h1>
      <p className="mt-3 font-mono text-xs text-muted">
        Branch {monitor.branch} · Watching since {formatDate(monitor.createdAt)} · Last checked{" "}
        {formatDate(monitor.checkedAt)}
      </p>

      <Card className="mt-8 bg-linear-to-b from-surface to-bg p-6 sm:p-10">
        <Eyebrow>Latest result</Eyebrow>
        {monitor.status === "unavailable" ? (
          <>
            <p className="mt-4 text-3xl font-medium tracking-tight sm:text-5xl">Checks stopped</p>
            <p className="mt-4 max-w-2xl leading-7 text-muted">
              This repository is private or no longer exists, so Hierophant stopped checking it.
            </p>
          </>
        ) : latest ? (
          <>
            <p
              className={cn(
                "mt-4 text-4xl font-medium tracking-[-0.025em] sm:text-6xl",
                STATUS_TEXT[latest.status],
              )}
            >
              {STATUS_LABEL[latest.status]}
            </p>
            <p className="mt-3 font-mono text-xs text-muted">
              Commit {latest.commitSha.slice(0, 7)} · Ruleset v{latest.rulesetVersion}
            </p>
            <a
              href={`/r/${latest.reportId}`}
              className="mt-4 inline-block text-sm text-text underline underline-offset-2 hover:text-dot"
            >
              View the latest report
            </a>
          </>
        ) : (
          <p className="mt-4 leading-7 text-muted">No report yet.</p>
        )}
        <p className="mt-6 max-w-2xl text-sm leading-6 text-muted">
          Hierophant checks the {monitor.branch} branch about every {minutes} minutes. When an agent
          file changes, it records which files changed and scans the new commit.
        </p>
      </Card>

      <section aria-labelledby="changes-title" className="mt-14">
        <Eyebrow>History</Eyebrow>
        <h2 id="changes-title" className="mt-3 text-2xl font-medium tracking-tight sm:text-4xl">
          Agent file changes
        </h2>
        {events.length > 0 ? (
          <ol className="mt-6 space-y-4">
            {events.map((event) => (
              <ChangeItem key={event.id} event={event} />
            ))}
          </ol>
        ) : (
          <p className="mt-4 leading-7 text-muted">
            No agent files have changed since watching started.
          </p>
        )}
      </section>

      <section aria-labelledby="follow-title" className="mt-14">
        <Eyebrow>Follow</Eyebrow>
        <h2 id="follow-title" className="mt-3 text-2xl font-medium tracking-tight sm:text-4xl">
          Get notified of changes
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">
          Add this feed to any RSS reader, or to a team chat tool that reads RSS. No account is
          needed.
        </p>
        <CopyField value={feedUrl} label="Copy feed URL" />
        <p className="mt-10 max-w-2xl text-sm leading-6 text-muted">
          This badge shows the newest result for the repository and links to this page.
        </p>
        <BadgeSnippet
          badgeSrc={`/api/badge/watch/${encodeURIComponent(monitor.owner)}/${encodeURIComponent(monitor.repo)}`}
          markdown={watchBadgeMarkdown(monitor.owner, monitor.repo)}
          alt={`Watched by Hierophant: ${latest ? STATUS_LABEL[latest.status] : "Watching"}`}
        />
      </section>

      <p className="mt-10 border-t border-line pt-5 text-sm leading-6 text-muted">
        Hierophant only stores agent file paths and their git hashes for watched repositories, never
        file contents. Results are automated signals, not a guarantee.
      </p>
    </article>
  );
}
