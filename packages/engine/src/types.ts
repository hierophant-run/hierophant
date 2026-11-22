import type { AgentImpact } from "./impact.js";

export type RepoFile = { path: string; content: string };

export type Severity = "critical" | "high" | "medium" | "low";

export type ScanStatus = "dangerous" | "needs_review" | "no_issues_found";

export type Finding = {
  ruleId: string;
  severity: Severity;
  title: string;
  why: string;
  fix: string;
  path: string;
  line: number;
  column?: number;
  /** Short, redacted, with hidden characters shown as U+XXXX. */
  excerpt?: string;
};

export type SkippedFile = { path: string; reason: string };

export type ScanResult = {
  status: ScanStatus;
  rulesetVersion: string;
  filesScanned: number;
  findings: Finding[];
  /** What each supported agent would do with this repository, in a fixed order. */
  impact: AgentImpact[];
  skipped: SkippedFile[];
};
