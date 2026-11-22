import {
  findPackages,
  scan,
  type PackageRef,
  type AgentId,
  type Finding,
  type Impact,
  type ScanResult,
  type ScanStatus,
  type Severity,
} from "@hierophant/engine";
import { collectFiles } from "./collect.js";

const SEVERITY_RANK: Record<Severity, number> = { critical: 3, high: 2, medium: 1, low: 0 };

export const STATUS_LABELS: Record<ScanStatus, string> = {
  dangerous: "Dangerous",
  needs_review: "Needs review",
  no_issues_found: "No issues found",
};

export const AGENT_LABELS: Record<AgentId, string> = {
  "claude-code": "Claude Code",
  cursor: "Cursor",
  vscode: "VS Code",
  "antigravity-cli": "Antigravity CLI",
  "gemini-cli": "Gemini CLI",
};

export const IMPACT_LABELS: Record<Impact, string> = {
  runs_on_open: "Runs on open",
  runs_after_trust_prompt: "Runs after trust prompt",
  steers_agent: "Steers the agent",
  behavior_unknown: "Behavior unknown",
  not_detected: "Not detected",
};

export type FailOn = Severity | "none";

/** A mistake in how a tool was called. Its message is safe to show. */
export class UsageError extends Error {}

export function parseFailOn(value: string | undefined): FailOn {
  const normalized = (value ?? "").trim().toLowerCase() || "high";
  if (normalized === "none" || Object.hasOwn(SEVERITY_RANK, normalized)) {
    return normalized as FailOn;
  }
  throw new UsageError("fail-on must be critical, high, medium, low, or none.");
}

export function reachesThreshold(
  findings: ReadonlyArray<Pick<Finding, "severity">>,
  failOn: FailOn,
): boolean {
  if (failOn === "none") return false;
  return findings.some((finding) => SEVERITY_RANK[finding.severity] >= SEVERITY_RANK[failOn]);
}

export const isSerious = (severity: Severity) => SEVERITY_RANK[severity] >= SEVERITY_RANK.high;

export function verdictLine(result: Pick<ScanResult, "status" | "rulesetVersion">): string {
  return result.status === "no_issues_found"
    ? `No issues found by ruleset v${result.rulesetVersion}. This is not a guarantee.`
    : "These are automated review signals from static checks. They are not a guarantee.";
}

export const visibleSkipped = (result: Pick<ScanResult, "skipped">) =>
  result.skipped.filter((entry) => entry.reason !== "Not an agent file");

/**
 * Scans a folder without executing anything. Excerpts are removed here, so that no local
 * tool can print file content into a terminal, a CI log, or an agent's context.
 */
export async function scanDirectory(root: string): Promise<ScanResult> {
  return (await scanDirectoryWithPackages(root)).result;
}

/** Also lists the packages that agent files would run. Finding them uses no network. */
export async function scanDirectoryWithPackages(
  root: string,
): Promise<{ result: ScanResult; packages: PackageRef[] }> {
  const { files, skipped } = await collectFiles(root);
  const result = scan(files);
  return {
    result: {
      ...result,
      findings: result.findings.map(({ excerpt: _excerpt, ...finding }) => finding),
      skipped: [...skipped, ...result.skipped],
    },
    packages: findPackages(files),
  };
}
