import {
  RULES,
  type AgentImpact,
  type Finding,
  type RuleId,
  type ScanStatus,
  type Severity,
  type SkippedFile,
} from "@hierophant/engine";
import { combineStatus, type PackageSummary } from "@hierophant/intel";
import type { StoredFinding, StoredReport } from "./report-store";

export type ReportFindingView = {
  /** Stable index of this finding within its report. */
  position: number;
  ruleId: string;
  severity: Severity;
  title: string;
  why: string;
  fix: string;
  path: string;
  line: number;
  column?: number;
  permalink: string;
  /** Only present on the response to a fresh scan. It is never stored. */
  excerpt?: string;
};

export type ReportView = {
  id: string;
  repository: { owner: string; name: string; url: string };
  commit: { sha: string; shortSha: string; url: string };
  scannedAt: string;
  rulesetVersion: string;
  status: ScanStatus;
  filesScanned: number;
  noAgentFiles: boolean;
  impact: AgentImpact[];
  findings: ReportFindingView[];
  skipped: SkippedFile[];
  packages: PackageSummary | null;
  disclaimer: string;
};

const encodePath = (path: string) => path.split("/").map(encodeURIComponent).join("/");

export const filePermalink = (repoUrl: string, sha: string, path: string, line: number) =>
  `${repoUrl}/blob/${sha}/${encodePath(path)}#L${line}`;

function describeRule(ruleId: string) {
  const rule = RULES[ruleId as RuleId];
  return rule
    ? { title: rule.title, why: rule.why, fix: rule.fix }
    : {
        title: ruleId,
        why: "This rule is no longer part of the current ruleset.",
        fix: "Scan the repository again.",
      };
}

function disclaimerFor(status: ScanStatus, rulesetVersion: string): string {
  return status === "no_issues_found"
    ? `No issues found by ruleset v${rulesetVersion}. This is not a guarantee.`
    : "These are automated review signals from static checks. They are not a guarantee.";
}

export function toReportView(report: StoredReport, excerpts?: readonly Finding[]): ReportView {
  const repoUrl = `https://github.com/${encodeURIComponent(report.owner)}/${encodeURIComponent(report.repo)}`;
  const excerptFor = (finding: StoredFinding) =>
    excerpts?.find(
      (candidate) =>
        candidate.ruleId === finding.ruleId &&
        candidate.path === finding.path &&
        candidate.line === finding.line,
    )?.excerpt;

  const status = combineStatus(report.status, report.packageChecks);

  return {
    id: report.id,
    repository: { owner: report.owner, name: report.repo, url: repoUrl },
    commit: {
      sha: report.commitSha,
      shortSha: report.commitSha.slice(0, 7),
      url: `${repoUrl}/commit/${report.commitSha}`,
    },
    scannedAt: report.createdAt.toISOString(),
    rulesetVersion: report.rulesetVersion,
    status,
    filesScanned: report.filesScanned,
    noAgentFiles: report.filesScanned === 0,
    impact: report.impact,
    findings: report.findings.map((finding, position) => {
      const excerpt = excerptFor(finding);
      return {
        ...finding,
        position,
        ...describeRule(finding.ruleId),
        permalink: filePermalink(repoUrl, report.commitSha, finding.path, finding.line),
        ...(excerpt ? { excerpt } : {}),
      };
    }),
    skipped: report.skipped,
    packages: report.packageChecks,
    disclaimer: disclaimerFor(status, report.rulesetVersion),
  };
}
