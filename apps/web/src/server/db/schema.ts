import type { AgentImpact, ScanStatus, Severity, SkippedFile } from "@hierophant/engine";
import type { PackageSummary } from "@hierophant/intel";
import {
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type { FeedbackReason } from "../feedback";

/** Reports hold metadata only. File contents and excerpts are never stored. */
export const reports = pgTable(
  "reports",
  {
    id: text("id").primaryKey(),
    owner: text("owner").notNull(),
    repo: text("repo").notNull(),
    repoKey: text("repo_key").notNull(),
    commitSha: text("commit_sha").notNull(),
    rulesetVersion: text("ruleset_version").notNull(),
    status: text("status").$type<ScanStatus>().notNull(),
    filesScanned: integer("files_scanned").notNull(),
    impact: jsonb("impact").$type<AgentImpact[]>().notNull(),
    skipped: jsonb("skipped").$type<SkippedFile[]>().notNull(),
    /** Public package names, versions, and advisory IDs. Never file content. */
    packageChecks: jsonb("package_checks").$type<PackageSummary>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("reports_repo_commit_ruleset_idx").on(
      table.repoKey,
      table.commitSha,
      table.rulesetVersion,
    ),
  ],
);

export const reportFindings = pgTable(
  "report_findings",
  {
    reportId: text("report_id")
      .notNull()
      .references(() => reports.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    ruleId: text("rule_id").notNull(),
    severity: text("severity").$type<Severity>().notNull(),
    path: text("path").notNull(),
    line: integer("line").notNull(),
    column: integer("column"),
  },
  (table) => [
    primaryKey({ columns: [table.reportId, table.position] }),
    index("report_findings_rule_idx").on(table.ruleId),
  ],
);

/** Anonymous false-positive counts. No free text or visitor data is stored. */
export const findingFeedback = pgTable(
  "finding_feedback",
  {
    reportId: text("report_id").notNull(),
    position: integer("position").notNull(),
    reason: text("reason").$type<FeedbackReason>().notNull(),
    count: integer("count").notNull().default(1),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.reportId, table.position, table.reason] }),
    foreignKey({
      columns: [table.reportId, table.position],
      foreignColumns: [reportFindings.reportId, reportFindings.position],
    }).onDelete("cascade"),
  ],
);

/** Keys are keyed hashes, so client IP addresses are not stored. */
export const rateLimits = pgTable(
  "rate_limits",
  {
    key: text("key").notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    count: integer("count").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.key, table.windowStart] }),
    index("rate_limits_window_idx").on(table.windowStart),
  ],
);

export type MonitorStatus = "active" | "unavailable";
export type MonitorKind = "repo" | "mcp" | "skill";

/** Public repositories someone asked to watch. Only git hashes and file paths are kept. */
export const monitors = pgTable(
  "monitors",
  {
    id: text("id").primaryKey(),
    kind: text("kind").$type<MonitorKind>().notNull().default("repo"),
    owner: text("owner").notNull(),
    repo: text("repo").notNull(),
    /** Unique per watched thing: a repository, an MCP Registry name, or a skill folder. */
    repoKey: text("repo_key").notNull(),
    /** The MCP Registry name or the skill folder path. Empty for repositories. */
    target: text("target").notNull().default(""),
    branch: text("branch").notNull(),
    commitSha: text("commit_sha").notNull(),
    /** Agent file path to git blob hash, used to see which files changed. */
    agentFiles: jsonb("agent_files").$type<Record<string, string>>().notNull(),
    status: text("status").$type<MonitorStatus>().notNull().default("active"),
    /** Latest check result for MCP servers and skills. Repositories use their reports. */
    lastStatus: text("last_status").$type<ScanStatus>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    checkedAt: timestamp("checked_at", { withTimezone: true }).defaultNow().notNull(),
    changedAt: timestamp("changed_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("monitors_repo_key_idx").on(table.repoKey),
    index("monitors_checked_idx").on(table.status, table.checkedAt),
  ],
);

/** One row per detected change to a watched repository's agent files. */
export const monitorEvents = pgTable(
  "monitor_events",
  {
    id: text("id").primaryKey(),
    monitorId: text("monitor_id")
      .notNull()
      .references(() => monitors.id, { onDelete: "cascade" }),
    commitSha: text("commit_sha").notNull(),
    added: jsonb("added").$type<string[]>().notNull(),
    changed: jsonb("changed").$type<string[]>().notNull(),
    removed: jsonb("removed").$type<string[]>().notNull(),
    reportId: text("report_id").references(() => reports.id, { onDelete: "set null" }),
    status: text("status").$type<ScanStatus>(),
    scanAttempts: integer("scan_attempts").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("monitor_events_monitor_idx").on(table.monitorId, table.createdAt),
    index("monitor_events_pending_idx").on(table.reportId, table.createdAt),
  ],
);
