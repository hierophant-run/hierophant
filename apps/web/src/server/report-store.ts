import { randomBytes } from "node:crypto";
import type { AgentImpact, Finding, ScanStatus, Severity, SkippedFile } from "@hierophant/engine";
import type { PackageSummary } from "@hierophant/intel";
import { and, asc, eq, sql } from "drizzle-orm";
import { findingFeedback, reportFindings, reports } from "./db/schema";
import type { Database } from "./db/types";
import type { FeedbackReason } from "./feedback";

export type StoredFinding = {
  ruleId: string;
  severity: Severity;
  path: string;
  line: number;
  column?: number;
};

export type StoredReport = {
  id: string;
  owner: string;
  repo: string;
  commitSha: string;
  rulesetVersion: string;
  status: ScanStatus;
  filesScanned: number;
  impact: AgentImpact[];
  skipped: SkippedFile[];
  findings: StoredFinding[];
  packageChecks: PackageSummary | null;
  createdAt: Date;
};

export type NewReport = Omit<StoredReport, "id" | "createdAt" | "findings" | "packageChecks"> & {
  findings: readonly Finding[];
  packageChecks?: PackageSummary | null;
};

export const repoKey = (owner: string, repo: string) => `${owner}/${repo}`.toLowerCase();
export const isReportId = (id: string) => /^[A-Za-z0-9_-]{22}$/.test(id);

export class ReportStore {
  constructor(private readonly db: Database) {}

  private async hydrate(row: typeof reports.$inferSelect): Promise<StoredReport> {
    const findings = await this.db
      .select()
      .from(reportFindings)
      .where(eq(reportFindings.reportId, row.id))
      .orderBy(asc(reportFindings.position));

    return {
      id: row.id,
      owner: row.owner,
      repo: row.repo,
      commitSha: row.commitSha,
      rulesetVersion: row.rulesetVersion,
      status: row.status,
      filesScanned: row.filesScanned,
      impact: row.impact,
      skipped: row.skipped,
      packageChecks: row.packageChecks,
      createdAt: row.createdAt,
      findings: findings.map((finding) => ({
        ruleId: finding.ruleId,
        severity: finding.severity,
        path: finding.path,
        line: finding.line,
        ...(finding.column === null ? {} : { column: finding.column }),
      })),
    };
  }

  async findById(id: string): Promise<StoredReport | null> {
    if (!isReportId(id)) return null;
    const [row] = await this.db.select().from(reports).where(eq(reports.id, id)).limit(1);
    return row ? this.hydrate(row) : null;
  }

  async findByCommit(
    owner: string,
    repo: string,
    commitSha: string,
    rulesetVersion: string,
  ): Promise<StoredReport | null> {
    const [row] = await this.db
      .select()
      .from(reports)
      .where(
        and(
          eq(reports.repoKey, repoKey(owner, repo)),
          eq(reports.commitSha, commitSha),
          eq(reports.rulesetVersion, rulesetVersion),
        ),
      )
      .limit(1);
    return row ? this.hydrate(row) : null;
  }

  async updatePackageChecks(reportId: string, packageChecks: PackageSummary): Promise<void> {
    await this.db.update(reports).set({ packageChecks }).where(eq(reports.id, reportId));
  }

  /** Counts a false-positive report. Returns false when the finding does not exist. */
  async recordFeedback(
    reportId: string,
    position: number,
    reason: FeedbackReason,
  ): Promise<boolean> {
    const [finding] = await this.db
      .select({ position: reportFindings.position })
      .from(reportFindings)
      .where(and(eq(reportFindings.reportId, reportId), eq(reportFindings.position, position)))
      .limit(1);
    if (!finding) return false;

    await this.db
      .insert(findingFeedback)
      .values({ reportId, position, reason })
      .onConflictDoUpdate({
        target: [findingFeedback.reportId, findingFeedback.position, findingFeedback.reason],
        set: { count: sql`${findingFeedback.count} + 1`, updatedAt: sql`now()` },
      });
    return true;
  }

  /** Stores a report. If a concurrent scan saved this commit first, returns that report. */
  async save(report: NewReport): Promise<StoredReport> {
    const id = randomBytes(16).toString("base64url");

    const inserted = await this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(reports)
        .values({
          id,
          owner: report.owner,
          repo: report.repo,
          repoKey: repoKey(report.owner, report.repo),
          commitSha: report.commitSha,
          rulesetVersion: report.rulesetVersion,
          status: report.status,
          filesScanned: report.filesScanned,
          impact: report.impact,
          skipped: report.skipped,
          packageChecks: report.packageChecks ?? null,
        })
        .onConflictDoNothing()
        .returning();
      if (!row) return null;

      if (report.findings.length > 0) {
        // Columns are listed one by one so that an excerpt can never reach the database.
        await tx.insert(reportFindings).values(
          report.findings.map((finding, position) => ({
            reportId: id,
            position,
            ruleId: finding.ruleId,
            severity: finding.severity,
            path: finding.path,
            line: finding.line,
            column: finding.column ?? null,
          })),
        );
      }
      return row;
    });

    if (inserted) return this.hydrate(inserted);
    const existing = await this.findByCommit(
      report.owner,
      report.repo,
      report.commitSha,
      report.rulesetVersion,
    );
    if (!existing) throw new Error("Report conflict could not be resolved");
    return existing;
  }
}
