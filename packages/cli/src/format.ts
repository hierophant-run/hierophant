import type { ScanResult, Severity } from "@hierophant/engine";
import {
  PACKAGE_FLAG_LABELS,
  PACKAGE_VERDICT_LABELS,
  packageDisplayName,
  packageSeverity,
  type PackageSummary,
} from "@hierophant/intel";
import {
  AGENT_LABELS,
  IMPACT_LABELS,
  STATUS_LABELS,
  verdictLine,
  visibleSkipped,
  type FailOn,
} from "@hierophant/local";

const ANSI = {
  reset: "\u001b[0m",
  bold: "\u001b[1m",
  dim: "\u001b[2m",
  red: "\u001b[31m",
  yellow: "\u001b[33m",
};

/** File names are untrusted, so they cannot be allowed to move the cursor or reorder text. */
export const sanitizeForTerminal = (value: string) =>
  value.replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, "?");

export function formatText(
  result: ScanResult,
  color: boolean,
  packages: PackageSummary | null = null,
  uncheckedPackages = 0,
): string {
  const paint = (code: keyof typeof ANSI, text: string) =>
    color ? `${ANSI[code]}${text}${ANSI.reset}` : text;
  const severityColor = (severity: Severity) =>
    severity === "critical" || severity === "high" ? "red" : "yellow";
  const statusColor =
    result.status === "dangerous" ? "red" : result.status === "needs_review" ? "yellow" : "bold";

  const lines = [
    `Hierophant, ruleset v${result.rulesetVersion}`,
    `Agent files checked: ${result.filesScanned}`,
    "",
    `Status: ${paint(statusColor, STATUS_LABELS[result.status])}`,
    "",
    "Open Impact",
    ...result.impact.map(
      (entry) => `  ${AGENT_LABELS[entry.agent].padEnd(17)}${IMPACT_LABELS[entry.impact]}`,
    ),
  ];

  if (result.findings.length > 0) {
    lines.push("", `Findings (${result.findings.length})`);
    for (const finding of result.findings) {
      const severity = paint(severityColor(finding.severity), finding.severity.toUpperCase());
      // The severity comes first so that a hostile path can never start a CI log command.
      lines.push(
        `  ${severity} ${finding.ruleId} ${sanitizeForTerminal(finding.path)}:${finding.line}`,
        `    ${finding.title}`,
        `    ${paint("dim", `Fix: ${finding.fix}`)}`,
      );
    }
  }

  if (packages && packages.checks.length > 0) {
    lines.push("", `Packages (${packages.checks.length})`);
    for (const check of packages.checks) {
      const name = sanitizeForTerminal(packageDisplayName(check));
      const severity = packageSeverity(check.verdict);
      const label = PACKAGE_VERDICT_LABELS[check.verdict];
      const flags = check.flags.map((flag) => `, ${PACKAGE_FLAG_LABELS[flag]}`).join("");
      const verdict = severity ? paint(severityColor(severity), label) : label;
      lines.push(`  - ${verdict}${flags}: ${name}`);
      if (check.advisories.length > 0) lines.push(`    ${check.advisories.join(", ")}`);
    }
    if (packages.omitted > 0) lines.push(`  ${packages.omitted} more packages were not checked.`);
  } else if (uncheckedPackages > 0) {
    lines.push("", `Packages found: ${uncheckedPackages}. Add --online to look them up.`);
  }

  const skipped = visibleSkipped(result);
  if (skipped.length > 0) {
    lines.push("", `Files not fully checked (${skipped.length})`);
    for (const entry of skipped) {
      lines.push(`  - ${sanitizeForTerminal(entry.path)}: ${entry.reason}`);
    }
  }

  lines.push("", verdictLine(result));
  return `${lines.join("\n")}\n`;
}

export function formatJson(
  result: ScanResult,
  failOn: FailOn,
  thresholdReached: boolean,
  packages: PackageSummary | null = null,
): string {
  return `${JSON.stringify(
    {
      tool: "hierophant",
      rulesetVersion: result.rulesetVersion,
      status: result.status,
      filesChecked: result.filesScanned,
      failOn,
      thresholdReached,
      impact: result.impact.map(({ agent, impact }) => ({ agent, impact })),
      findings: result.findings,
      ...(packages ? { packages } : {}),
      notFullyChecked: visibleSkipped(result),
      notice: verdictLine(result),
    },
    null,
    2,
  )}\n`;
}
