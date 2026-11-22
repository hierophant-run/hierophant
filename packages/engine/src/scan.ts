import { RULES, RULESET_VERSION, type RuleId } from "./catalog.js";
import { extractCommands, extractMcpServers, folderOpenTasks, mcpHelperFacts } from "./facts.js";
import { computeImpact } from "./impact.js";
import { MAX_FILE_CHARS, MAX_FILES, MAX_FINDINGS_PER_FILE, MAX_TOTAL_CHARS } from "./limits.js";
import { runCommandRules } from "./rules/commands.js";
import { runMcpRules } from "./rules/mcp.js";
import { runPermissionRules } from "./rules/permissions.js";
import type { ReportOptions, Reporter } from "./rules/reporter.js";
import { runTextRules } from "./rules/text.js";
import { parsePackageSpec, type PackageRef } from "./packages.js";
import { launchedPackages, referencedScriptPaths } from "./shell.js";
import { classifyPath, normalizePath, type Target } from "./targets.js";
import { LineIndex, toExcerpt } from "./text.js";
import { ParseFailure, parseJsonc, parseYaml, type TreeNode } from "./tree.js";
import type { Finding, RepoFile, ScanResult, ScanStatus, Severity, SkippedFile } from "./types.js";

const SEVERITY_ORDER: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 };

/** A command finding already explains these, so a second card on the same line adds noise. */
const COVERED_BY_COMMAND_RULE: ReadonlySet<string> = new Set(["EXEC-001", "EXEC-002"]);
const COMMAND_RULES: ReadonlySet<string> = new Set(["AUTO-002", "AUTO-004"]);

type LoadedFile = { path: string; content: string; target: Target; tree?: TreeNode };

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function parseConfig(file: LoadedFile, skipped: SkippedFile[]): void {
  if (!file.target.config) return;
  try {
    file.tree = file.target.format === "yaml" ? parseYaml(file.content) : parseJsonc(file.content);
  } catch (error) {
    if (!(error instanceof ParseFailure)) throw error;
    skipped.push({
      path: file.path,
      reason: "Could not parse this configuration, so only text checks ran",
    });
  }
}

function loadFiles(files: readonly RepoFile[]) {
  const loaded: LoadedFile[] = [];
  const others = new Map<string, string>();
  const skipped: SkippedFile[] = [];
  const seen = new Set<string>();
  let totalChars = 0;

  const ordered = files
    .map((file) => ({ file, path: normalizePath(file.path) }))
    .sort((a, b) => compareText(a.path ?? a.file.path, b.path ?? b.file.path));

  for (const { file, path } of ordered) {
    if (path === null) {
      skipped.push({ path: file.path, reason: "Invalid file path" });
      continue;
    }
    if (seen.has(path)) {
      skipped.push({ path, reason: "Duplicate file path" });
      continue;
    }
    seen.add(path);

    if (file.content.length > MAX_FILE_CHARS) {
      skipped.push({ path, reason: "File is too large to scan" });
      continue;
    }
    if (file.content.includes("\0")) {
      skipped.push({ path, reason: "Binary file" });
      continue;
    }

    const target = classifyPath(path);
    if (!target) {
      others.set(path, file.content);
      continue;
    }
    if (loaded.length >= MAX_FILES) {
      skipped.push({ path, reason: "File limit reached" });
      continue;
    }
    if (totalChars + file.content.length > MAX_TOTAL_CHARS) {
      skipped.push({ path, reason: "Total size limit reached" });
      continue;
    }

    totalChars += file.content.length;
    const entry: LoadedFile = { path, content: file.content, target };
    parseConfig(entry, skipped);
    loaded.push(entry);
  }
  return { loaded, others, skipped };
}

function commandsOf(file: LoadedFile) {
  return [
    ...extractCommands(file.target.config, file.tree),
    ...(file.target.config === "mcp" ? mcpHelperFacts(file.tree) : []),
  ];
}

function scanFile(file: LoadedFile, scripts: ReadonlyMap<string, string>): Finding[] {
  const lines = new LineIndex(file.content);
  const findings = new Map<string, Finding>();

  const report: Reporter = (ruleId: RuleId, offset: number, options?: ReportOptions) => {
    const { line, column } = lines.position(offset);
    const key = `${ruleId}:${line}`;
    if (findings.has(key)) return;

    const rule = RULES[ruleId];
    const excerpt = toExcerpt(lines.line(line));
    findings.set(key, {
      ruleId,
      severity: options?.severity ?? rule.severity,
      title: rule.title,
      why: rule.why,
      fix: rule.fix,
      path: file.path,
      line,
      column,
      ...(excerpt ? { excerpt } : {}),
    });
  };

  const { config, text } = file.target;
  runCommandRules(
    commandsOf(file),
    config === "vscode-tasks" ? folderOpenTasks(file.tree) : [],
    scripts,
    report,
  );
  runMcpRules(extractMcpServers(config, file.tree), report);
  runPermissionRules(config, file.tree, report);
  runTextRules(text, file.path, file.content, lines, report);

  const all = [...findings.values()];
  const coveredLines = new Set(all.filter((f) => COMMAND_RULES.has(f.ruleId)).map((f) => f.line));
  return all.filter((f) => !(COVERED_BY_COMMAND_RULE.has(f.ruleId) && coveredLines.has(f.line)));
}

function compareFindings(a: Finding, b: Finding): number {
  return (
    SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
    compareText(a.path, b.path) ||
    a.line - b.line ||
    compareText(a.ruleId, b.ruleId)
  );
}

function statusOf(findings: readonly Finding[]): ScanStatus {
  if (findings.some((f) => f.severity === "critical" || f.severity === "high")) return "dangerous";
  return findings.length > 0 ? "needs_review" : "no_issues_found";
}

/** Scans in-memory repository files. It performs no I/O and never executes their content. */
export function scan(files: readonly RepoFile[]): ScanResult {
  const { loaded, others, skipped } = loadFiles(files);

  const scripts = new Map(others);
  for (const file of loaded) scripts.set(file.path, file.content);

  const referenced = new Set(
    loaded.flatMap((file) => commandsOf(file).flatMap((c) => referencedScriptPaths(c.text))),
  );
  for (const path of others.keys()) {
    if (!referenced.has(path)) skipped.push({ path, reason: "Not an agent file" });
  }

  const findings: Finding[] = [];
  for (const file of loaded) {
    const fileFindings = scanFile(file, scripts).sort(compareFindings);
    if (fileFindings.length > MAX_FINDINGS_PER_FILE) {
      skipped.push({
        path: file.path,
        reason: `Showing the ${MAX_FINDINGS_PER_FILE} most severe of ${fileFindings.length} findings`,
      });
    }
    findings.push(...fileFindings.slice(0, MAX_FINDINGS_PER_FILE));
  }
  findings.sort(compareFindings);
  skipped.sort((a, b) => compareText(a.path, b.path) || compareText(a.reason, b.reason));

  return {
    status: statusOf(findings),
    rulesetVersion: RULESET_VERSION,
    filesScanned: loaded.length,
    findings,
    impact: computeImpact(findings, new Set(loaded.map((file) => file.path))),
    skipped,
  };
}

/**
 * Lists scripts named by automatic commands. A fetcher can load these too,
 * so that packed payloads outside agent folders are still inspected.
 */
export function findReferencedScripts(files: readonly RepoFile[]): string[] {
  const { loaded } = loadFiles(files);
  const paths = new Set(
    loaded.flatMap((file) => commandsOf(file).flatMap((c) => referencedScriptPaths(c.text))),
  );
  return [...paths].sort(compareText);
}

const COMMAND_SEPARATOR = /&&|\|\||[;|\n]/;

/**
 * Lists public packages that agent files would download and run. It reads text only,
 * so that a caller can look them up without this engine touching the network.
 */
export function findPackages(files: readonly RepoFile[]): PackageRef[] {
  const { loaded } = loadFiles(files);
  const found = new Map<string, PackageRef>();

  for (const file of loaded) {
    const lines = new LineIndex(file.content);
    const add = (command: string, args: readonly string[], offset: number) => {
      for (const { ecosystem, spec } of launchedPackages(command, args)) {
        const parsed = parsePackageSpec(ecosystem, spec);
        if (!parsed) continue;
        const { line } = lines.position(offset);
        const key = `${ecosystem}:${parsed.name}:${parsed.requested}:${file.path}:${line}`;
        found.set(key, { ecosystem, ...parsed, path: file.path, line });
      }
    };

    for (const server of extractMcpServers(file.target.config, file.tree)) {
      if (server.command !== undefined) add(server.command, server.args, server.commandOffset);
    }
    for (const fact of commandsOf(file)) {
      for (const part of fact.text.split(COMMAND_SEPARATOR)) add(part.trim(), [], fact.offset);
    }
  }

  return [...found.values()].sort(
    (a, b) =>
      compareText(a.ecosystem, b.ecosystem) ||
      compareText(a.name, b.name) ||
      compareText(a.path, b.path) ||
      a.line - b.line,
  );
}
