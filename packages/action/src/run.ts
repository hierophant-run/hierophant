import { appendFile, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import type { Finding, ScanResult } from "@hierophant/engine";
import {
  AGENT_LABELS,
  IMPACT_LABELS,
  isSerious,
  parseFailOn,
  reachesThreshold,
  scanDirectory,
  STATUS_LABELS,
  UsageError,
  verdictLine,
  visibleSkipped,
  type FailOn,
} from "@hierophant/local";

export { parseFailOn };

const MAX_ANNOTATIONS = 50;
const MAX_SUMMARY_ROWS = 100;

export type Env = Record<string, string | undefined>;
export type Write = (line: string) => void;

/** Workflow commands are parsed from logs, so repository text must not be able to form one. */
export const escapeCommandData = (value: string) =>
  value.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");

export const escapeCommandProperty = (value: string) =>
  escapeCommandData(value).replace(/:/g, "%3A").replace(/,/g, "%2C");

/** Encodes everything except plain path characters, so a file name cannot add Markdown or HTML. */
export const escapeMarkdown = (value: string) =>
  value.replace(/[^\p{L}\p{N}/.-]/gu, (char) => `&#${char.codePointAt(0)};`);

export function formatAnnotation(finding: Finding, prefix: string): string {
  const level = isSerious(finding.severity) ? "error" : "warning";
  const file = prefix ? `${prefix}/${finding.path}` : finding.path;
  const properties = [
    `file=${escapeCommandProperty(file)}`,
    `line=${finding.line}`,
    `title=${escapeCommandProperty(`${finding.ruleId}: ${finding.title}`)}`,
  ].join(",");
  return `::${level} ${properties}::${escapeCommandData(`${finding.why} ${finding.fix}`)}`;
}

export function formatSummary(result: ScanResult): string {
  const lines = [
    `## Hierophant: ${STATUS_LABELS[result.status]}`,
    "",
    `Ruleset v${result.rulesetVersion}. Agent files checked: ${result.filesScanned}.`,
    "",
    verdictLine(result),
    "",
    "### Open Impact",
    "",
    "| Agent | Impact |",
    "| --- | --- |",
    ...result.impact.map(
      (entry) => `| ${AGENT_LABELS[entry.agent]} | ${IMPACT_LABELS[entry.impact]} |`,
    ),
  ];

  if (result.findings.length > 0) {
    lines.push(
      "",
      "### Findings",
      "",
      "| Severity | Rule | File | Issue |",
      "| --- | --- | --- | --- |",
    );
    for (const finding of result.findings.slice(0, MAX_SUMMARY_ROWS)) {
      const location = `${escapeMarkdown(finding.path)}:${finding.line}`;
      lines.push(`| ${finding.severity} | ${finding.ruleId} | ${location} | ${finding.title} |`);
    }
    if (result.findings.length > MAX_SUMMARY_ROWS) {
      lines.push("", `Showing ${MAX_SUMMARY_ROWS} of ${result.findings.length} findings.`);
    }
  }

  const skipped = visibleSkipped(result);
  if (skipped.length > 0) {
    lines.push("", "### Files not fully checked", "", "| File | Reason |", "| --- | --- |");
    for (const entry of skipped.slice(0, MAX_SUMMARY_ROWS)) {
      lines.push(`| ${escapeMarkdown(entry.path)} | ${escapeMarkdown(entry.reason)} |`);
    }
  }
  return `${lines.join("\n")}\n`;
}

async function resolveScanRoot(workspace: string, input: string): Promise<string> {
  if (isAbsolute(input)) throw new UsageError("path must be relative to the workspace.");
  const base = await realpath(workspace);
  let target: string;
  try {
    target = await realpath(resolve(base, input));
  } catch {
    throw new UsageError("path does not exist in the workspace.");
  }
  if (target !== base && !target.startsWith(`${base}${sep}`)) {
    throw new UsageError("path must stay inside the workspace.");
  }
  return target;
}

export async function run(env: Env, write: Write): Promise<number> {
  let failOn: FailOn;
  let root: string;
  let base: string;
  try {
    failOn = parseFailOn(env["INPUT_FAIL-ON"]);
    base = await realpath(env.GITHUB_WORKSPACE || process.cwd());
    root = await resolveScanRoot(base, (env.INPUT_PATH ?? "").trim() || ".");
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    write(`::error::${escapeCommandData(error.message)}`);
    return 2;
  }

  const result = await scanDirectory(root);
  const prefix = relative(base, root).split(sep).join("/");

  for (const finding of result.findings.slice(0, MAX_ANNOTATIONS)) {
    write(formatAnnotation(finding, prefix));
  }

  if (env.GITHUB_OUTPUT) {
    await appendFile(
      env.GITHUB_OUTPUT,
      `status=${result.status}\nfindings=${result.findings.length}\nruleset-version=${result.rulesetVersion}\n`,
    );
  }
  if (env.GITHUB_STEP_SUMMARY) await appendFile(env.GITHUB_STEP_SUMMARY, formatSummary(result));

  write(`Hierophant: ${STATUS_LABELS[result.status]} (${result.findings.length} findings).`);
  write(verdictLine(result));

  if (reachesThreshold(result.findings, failOn)) {
    write(`::error::Findings reached the fail-on level (${failOn}).`);
    return 1;
  }
  return 0;
}
