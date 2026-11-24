import type { ScanStatus } from "@hierophant/engine";
import { checkPath } from "@/lib/check-target";
import { SITE_URL } from "@/lib/site";
import { isRepoName } from "./github-url";
import type { Monitor, MonitorEvent, MonitorStore } from "./monitor-store";
import { guardDatabase } from "./scan-service";

export type WatchData = {
  monitor: Monitor;
  events: MonitorEvent[];
  /** The newest result. Repositories link to a report; MCP servers and skills to their check. */
  latest: {
    status: ScanStatus;
    href: string;
    detail: string;
  } | null;
};

export const STATUS_LABEL: Record<ScanStatus, string> = {
  dangerous: "Dangerous",
  needs_review: "Needs review",
  no_issues_found: "No issues found",
};

type MonitorRef = Pick<Monitor, "id" | "kind" | "owner" | "repo" | "target">;

export const watchPath = (monitor: MonitorRef) =>
  monitor.kind === "repo"
    ? `/w/${encodeURIComponent(monitor.owner)}/${encodeURIComponent(monitor.repo)}`
    : `/watch/${monitor.id}`;

export const watchName = (monitor: MonitorRef) =>
  monitor.kind === "mcp"
    ? monitor.target
    : monitor.kind === "skill"
      ? monitor.target.split("/").at(-1) || monitor.repo
      : `${monitor.owner}/${monitor.repo}`;

export const KIND_LABEL: Record<Monitor["kind"], string> = {
  repo: "Repository",
  mcp: "MCP server",
  skill: "Agent skill",
};

export const watchBadgePath = (monitor: MonitorRef) =>
  monitor.kind === "repo"
    ? `/api/badge/watch/${encodeURIComponent(monitor.owner)}/${encodeURIComponent(monitor.repo)}`
    : `/api/badge/monitor/${monitor.id}`;

/** The live check page for an MCP server or a skill. */
export const checkHref = (monitor: MonitorRef) =>
  monitor.kind === "mcp"
    ? checkPath({ kind: "mcp", name: monitor.target })
    : checkPath({ kind: "skill", owner: monitor.owner, repo: monitor.repo, path: monitor.target });

async function withHistory(monitor: Monitor, monitors: MonitorStore): Promise<WatchData> {
  if (monitor.kind !== "repo") {
    const events = await guardDatabase(() => monitors.events(monitor.id, 30));
    const latest = monitor.lastStatus
      ? { status: monitor.lastStatus, href: checkHref(monitor), detail: "Latest check" }
      : null;
    return { monitor, events, latest };
  }
  const [events, scan] = await guardDatabase(() =>
    Promise.all([
      monitors.events(monitor.id, 30),
      monitors.latestScan(monitor.owner, monitor.repo),
    ]),
  );
  const latest = scan
    ? {
        status: scan.status,
        href: `/r/${scan.reportId}`,
        detail: `Commit ${scan.commitSha.slice(0, 7)} · Ruleset v${scan.rulesetVersion}`,
      }
    : null;
  return { monitor, events, latest };
}

export async function loadWatch(
  owner: string,
  repo: string,
  monitors: MonitorStore,
): Promise<WatchData | null> {
  if (!isRepoName(owner, repo)) return null;
  const monitor = await guardDatabase(() => monitors.findByRepo(owner, repo));
  return monitor ? withHistory(monitor, monitors) : null;
}

export async function loadWatchById(id: string, monitors: MonitorStore): Promise<WatchData | null> {
  const monitor = await guardDatabase(() => monitors.findById(id));
  if (!monitor || monitor.kind === "repo") return null;
  return withHistory(monitor, monitors);
}

export function describeChange(event: MonitorEvent, kind: Monitor["kind"] = "repo"): string {
  if (kind === "mcp") {
    return `Registry record changed: ${[...event.added, ...event.changed, ...event.removed].join(", ")}`;
  }
  const parts = [
    event.added.length ? `${event.added.length} added` : "",
    event.changed.length ? `${event.changed.length} changed` : "",
    event.removed.length ? `${event.removed.length} removed` : "",
  ].filter(Boolean);
  return `${kind === "skill" ? "Skill files" : "Agent files"} changed: ${parts.join(", ")}`;
}

export function eventResult(event: MonitorEvent, kind: Monitor["kind"] = "repo"): string {
  if (event.status) return STATUS_LABEL[event.status];
  if (kind !== "repo") return "Check could not finish";
  return event.scanAttempts >= 3 ? "Scan could not finish" : "Scan pending";
}

const escapeXml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

/** An Atom feed of changes. Names and paths come from public sources and are escaped. */
export function renderFeed(data: WatchData, siteUrl: string = SITE_URL): string {
  const { monitor, events } = data;
  const name = watchName(monitor);
  const page = `${siteUrl}${watchPath(monitor)}`;
  const updated = (events[0]?.createdAt ?? monitor.createdAt).toISOString();

  const entries = events.map((event) => {
    const link = event.reportId
      ? `${siteUrl}/r/${event.reportId}`
      : monitor.kind === "repo"
        ? page
        : `${siteUrl}${checkHref(monitor)}`;
    const lines = [
      ...event.added.map((path) => `Added: ${path}`),
      ...event.changed.map((path) => `Changed: ${path}`),
      ...event.removed.map((path) => `Removed: ${path}`),
      monitor.kind === "mcp"
        ? `Version: ${event.commitSha}`
        : `Commit: ${event.commitSha.slice(0, 7)}`,
      `Result: ${eventResult(event, monitor.kind)}`,
    ];
    return [
      "<entry>",
      `<id>${escapeXml(`${page}#${event.id}`)}</id>`,
      `<title>${escapeXml(`${name}: ${eventResult(event, monitor.kind)}`)}</title>`,
      `<updated>${event.createdAt.toISOString()}</updated>`,
      `<link rel="alternate" href="${escapeXml(link)}"/>`,
      `<summary type="text">${escapeXml(`${describeChange(event, monitor.kind)}\n${lines.join("\n")}`)}</summary>`,
      "</entry>",
    ].join("");
  });

  const what =
    monitor.kind === "mcp"
      ? "its official MCP Registry record"
      : monitor.kind === "skill"
        ? `the skill files on the ${monitor.branch} branch`
        : `the agent files on the ${monitor.branch} branch`;
  const started = [
    "<entry>",
    `<id>${escapeXml(`${page}#started`)}</id>`,
    `<title>${escapeXml(`${name}: watching started`)}</title>`,
    `<updated>${monitor.createdAt.toISOString()}</updated>`,
    `<link rel="alternate" href="${escapeXml(page)}"/>`,
    `<summary type="text">${escapeXml(`Hierophant is watching ${what}.`)}</summary>`,
    "</entry>",
  ].join("");

  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<feed xmlns="http://www.w3.org/2005/Atom">',
    `<id>${escapeXml(page)}</id>`,
    `<title>${escapeXml(`Hierophant: ${name}`)}</title>`,
    `<subtitle>${escapeXml(`Changes to ${KIND_LABEL[monitor.kind].toLowerCase()} ${name}`)}</subtitle>`,
    `<link rel="alternate" href="${escapeXml(page)}"/>`,
    `<link rel="self" href="${escapeXml(`${page}/feed.xml`)}"/>`,
    `<updated>${updated}</updated>`,
    ...entries,
    started,
    "</feed>",
  ].join("\n");
}
