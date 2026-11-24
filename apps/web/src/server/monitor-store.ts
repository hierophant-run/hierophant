import { randomBytes } from "node:crypto";
import type { ScanStatus } from "@hierophant/engine";
import { and, asc, count, desc, eq, isNull, lt, sql } from "drizzle-orm";
import {
  monitorEvents,
  monitors,
  reports,
  type MonitorKind,
  type MonitorStatus,
} from "./db/schema";
import type { Database } from "./db/types";
import { repoKey } from "./report-store";

export type Monitor = typeof monitors.$inferSelect;
export type MonitorEvent = typeof monitorEvents.$inferSelect;

export type AgentFileDiff = { added: string[]; changed: string[]; removed: string[] };

export type LatestScan = {
  reportId: string;
  status: ScanStatus;
  commitSha: string;
  rulesetVersion: string;
  createdAt: Date;
};

const newId = () => randomBytes(16).toString("base64url");
const MAX_PATHS_PER_LIST = 50;

export function diffAgentFiles(
  before: Record<string, string>,
  after: Record<string, string>,
): AgentFileDiff {
  const added: string[] = [];
  const changed: string[] = [];
  const removed: string[] = [];
  for (const [path, sha] of Object.entries(after)) {
    if (!(path in before)) added.push(path);
    else if (before[path] !== sha) changed.push(path);
  }
  for (const path of Object.keys(before)) if (!(path in after)) removed.push(path);
  const tidy = (list: string[]) => list.sort().slice(0, MAX_PATHS_PER_LIST);
  return { added: tidy(added), changed: tidy(changed), removed: tidy(removed) };
}

export const hasChanges = (diff: AgentFileDiff) =>
  diff.added.length + diff.changed.length + diff.removed.length > 0;

/** The unique key for each kind of watched thing. */
export const monitorKey = (kind: MonitorKind, owner: string, repo: string, target = ""): string =>
  kind === "repo"
    ? repoKey(owner, repo)
    : kind === "mcp"
      ? `mcp:${target.toLowerCase()}`
      : `skill:${repoKey(owner, repo)}/${target.toLowerCase()}`;

export class MonitorStore {
  constructor(private readonly db: Database) {}

  async findByRepo(owner: string, repo: string): Promise<Monitor | null> {
    const [row] = await this.db
      .select()
      .from(monitors)
      .where(eq(monitors.repoKey, repoKey(owner, repo)))
      .limit(1);
    return row ?? null;
  }

  async findByKey(key: string): Promise<Monitor | null> {
    const [row] = await this.db.select().from(monitors).where(eq(monitors.repoKey, key)).limit(1);
    return row ?? null;
  }

  async findById(id: string): Promise<Monitor | null> {
    if (!/^[A-Za-z0-9_-]{22}$/.test(id)) return null;
    const [row] = await this.db.select().from(monitors).where(eq(monitors.id, id)).limit(1);
    return row ?? null;
  }

  async total(): Promise<number> {
    const [row] = await this.db.select({ value: count() }).from(monitors);
    return row?.value ?? 0;
  }

  /** Creates a monitor, or returns the existing one if the repository is already watched. */
  async create(input: {
    kind?: MonitorKind;
    owner: string;
    repo: string;
    target?: string;
    branch: string;
    commitSha: string;
    agentFiles: Record<string, string>;
    lastStatus?: ScanStatus | null;
  }): Promise<{ monitor: Monitor; created: boolean }> {
    const kind = input.kind ?? "repo";
    const key = monitorKey(kind, input.owner, input.repo, input.target);
    const [row] = await this.db
      .insert(monitors)
      .values({ id: newId(), repoKey: key, ...input, kind })
      .onConflictDoNothing()
      .returning();
    if (row) return { monitor: row, created: true };
    const existing = await this.findByKey(key);
    if (!existing) throw new Error("Monitor conflict could not be resolved");
    return { monitor: existing, created: false };
  }

  async due(before: Date, limit: number): Promise<Monitor[]> {
    return this.db
      .select()
      .from(monitors)
      .where(and(eq(monitors.status, "active"), lt(monitors.checkedAt, before)))
      .orderBy(asc(monitors.checkedAt))
      .limit(limit);
  }

  async touch(id: string, update: { commitSha?: string; status?: MonitorStatus } = {}) {
    await this.db
      .update(monitors)
      .set({ checkedAt: sql`now()`, ...update })
      .where(eq(monitors.id, id));
  }

  /** Records a change and moves the monitor to the new commit in one step. */
  async recordChange(
    monitor: Monitor,
    commitSha: string,
    agentFiles: Record<string, string>,
    diff: AgentFileDiff,
    status: ScanStatus | null = null,
  ): Promise<MonitorEvent> {
    return this.db.transaction(async (tx) => {
      const [event] = await tx
        .insert(monitorEvents)
        .values({ id: newId(), monitorId: monitor.id, commitSha, ...diff, status })
        .returning();
      await tx
        .update(monitors)
        .set({
          commitSha,
          agentFiles,
          checkedAt: sql`now()`,
          changedAt: sql`now()`,
          ...(status ? { lastStatus: status } : {}),
        })
        .where(eq(monitors.id, monitor.id));
      if (!event) throw new Error("Monitor event was not saved");
      return event;
    });
  }

  /** The oldest change that still needs a scan, with its repository. */
  async nextPending(
    maxAttempts: number,
  ): Promise<{ event: MonitorEvent; monitor: Monitor } | null> {
    const [row] = await this.db
      .select({ event: monitorEvents, monitor: monitors })
      .from(monitorEvents)
      .innerJoin(monitors, eq(monitorEvents.monitorId, monitors.id))
      .where(
        and(
          eq(monitors.kind, "repo"),
          isNull(monitorEvents.reportId),
          lt(monitorEvents.scanAttempts, maxAttempts),
        ),
      )
      .orderBy(asc(monitorEvents.createdAt))
      .limit(1);
    return row ?? null;
  }

  async markAttempt(eventId: string) {
    await this.db
      .update(monitorEvents)
      .set({ scanAttempts: sql`${monitorEvents.scanAttempts} + 1` })
      .where(eq(monitorEvents.id, eventId));
  }

  async attachReport(eventId: string, reportId: string, status: ScanStatus) {
    await this.db
      .update(monitorEvents)
      .set({ reportId, status, scanAttempts: sql`${monitorEvents.scanAttempts} + 1` })
      .where(eq(monitorEvents.id, eventId));
  }

  async events(monitorId: string, limit = 50): Promise<MonitorEvent[]> {
    return this.db
      .select()
      .from(monitorEvents)
      .where(eq(monitorEvents.monitorId, monitorId))
      .orderBy(desc(monitorEvents.createdAt))
      .limit(limit);
  }

  /** The newest stored report for this repository, whichever way it was scanned. */
  async latestScan(owner: string, repo: string): Promise<LatestScan | null> {
    const [row] = await this.db
      .select({
        reportId: reports.id,
        status: reports.status,
        commitSha: reports.commitSha,
        rulesetVersion: reports.rulesetVersion,
        createdAt: reports.createdAt,
      })
      .from(reports)
      .where(eq(reports.repoKey, repoKey(owner, repo)))
      .orderBy(desc(reports.createdAt))
      .limit(1);
    return row ?? null;
  }
}
