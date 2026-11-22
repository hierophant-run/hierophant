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
