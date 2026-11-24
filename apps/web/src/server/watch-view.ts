import type { ScanStatus } from "@hierophant/engine";
import { SITE_URL } from "@/lib/site";
import { isRepoName } from "./github-url";
import type { Monitor, MonitorEvent, MonitorStore } from "./monitor-store";
import { guardDatabase } from "./scan-service";

export type WatchData = {
  monitor: Monitor;
  events: MonitorEvent[];
  latest: {
    reportId: string;
    status: ScanStatus;
    commitSha: string;
    rulesetVersion: string;
  } | null;
};

const STATUS_LABEL: Record<ScanStatus, string> = {
  dangerous: "Dangerous",
  needs_review: "Needs review",
  no_issues_found: "No issues found",
};

export async function loadWatch(
  owner: string,
  repo: string,
  monitors: MonitorStore,
): Promise<WatchData | null> {
  if (!isRepoName(owner, repo)) return null;
  const monitor = await guardDatabase(() => monitors.findByRepo(owner, repo));
  if (!monitor) return null;
  const [events, latest] = await guardDatabase(() =>
    Promise.all([
      monitors.events(monitor.id, 30),
      monitors.latestScan(monitor.owner, monitor.repo),
    ]),
  );
  return { monitor, events, latest };
}

export const watchPath = (monitor: Pick<Monitor, "owner" | "repo">) =>
  `/w/${encodeURIComponent(monitor.owner)}/${encodeURIComponent(monitor.repo)}`;

export function describeChange(event: MonitorEvent): string {
  const parts = [
    event.added.length ? `${event.added.length} added` : "",
    event.changed.length ? `${event.changed.length} changed` : "",
    event.removed.length ? `${event.removed.length} removed` : "",
  ].filter(Boolean);
  return `Agent files changed: ${parts.join(", ")}`;
}

export function eventResult(event: MonitorEvent): string {
  if (event.status) return STATUS_LABEL[event.status];
  return event.scanAttempts >= 3 ? "Scan could not finish" : "Scan pending";
}

const escapeXml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

/** An Atom feed of agent file changes. Paths come from public repositories and are escaped. */
export function renderFeed(data: WatchData, siteUrl: string = SITE_URL): string {
  const { monitor, events } = data;
  const name = `${monitor.owner}/${monitor.repo}`;
  const page = `${siteUrl}${watchPath(monitor)}`;
  const updated = (events[0]?.createdAt ?? monitor.createdAt).toISOString();

  const entries = events.map((event) => {
    const link = event.reportId ? `${siteUrl}/r/${event.reportId}` : page;
    const lines = [
      ...event.added.map((path) => `Added: ${path}`),
      ...event.changed.map((path) => `Changed: ${path}`),
      ...event.removed.map((path) => `Removed: ${path}`),
      `Commit: ${event.commitSha.slice(0, 7)}`,
      `Result: ${eventResult(event)}`,
    ];
    return [
      "<entry>",
      `<id>${escapeXml(`${page}#${event.id}`)}</id>`,
      `<title>${escapeXml(`${name}: ${eventResult(event)}`)}</title>`,
      `<updated>${event.createdAt.toISOString()}</updated>`,
      `<link rel="alternate" href="${escapeXml(link)}"/>`,
      `<summary type="text">${escapeXml(`${describeChange(event)}\n${lines.join("\n")}`)}</summary>`,
      "</entry>",
    ].join("");
  });

  const started = [
    "<entry>",
    `<id>${escapeXml(`${page}#started`)}</id>`,
    `<title>${escapeXml(`${name}: watching started`)}</title>`,
    `<updated>${monitor.createdAt.toISOString()}</updated>`,
    `<link rel="alternate" href="${escapeXml(page)}"/>`,
    `<summary type="text">${escapeXml(`Hierophant is watching the agent files on the ${monitor.branch} branch.`)}</summary>`,
    "</entry>",
  ].join("");

  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<feed xmlns="http://www.w3.org/2005/Atom">',
    `<id>${escapeXml(page)}</id>`,
    `<title>${escapeXml(`Hierophant: ${name}`)}</title>`,
    `<subtitle>Changes to agent files in ${escapeXml(name)}</subtitle>`,
    `<link rel="alternate" href="${escapeXml(page)}"/>`,
    `<link rel="self" href="${escapeXml(`${page}/feed.xml`)}"/>`,
    `<updated>${updated}</updated>`,
    ...entries,
    started,
    "</feed>",
  ].join("\n");
}
