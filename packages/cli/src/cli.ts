import { realpath, stat } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { parseArgs, type ParseArgsConfig } from "node:util";
import { ENGINE_VERSION, RULESET_VERSION } from "@hierophant/engine";
import {
  checkPackages,
  combineStatus,
  packageSeverity,
  type FetchLike,
  type PackageSummary,
} from "@hierophant/intel";
import {
  parseFailOn,
  reachesThreshold,
  scanDirectoryWithPackages,
  UsageError,
} from "@hierophant/local";
import { formatJson, formatText } from "./format.js";
import {
  applyLock,
  LOCK_AGENTS,
  planLock,
  undoLock,
  type LockEntry,
  type LockEnv,
} from "./lock.js";

export type CliIo = LockEnv & {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
  cwd: string;
  color: boolean;
  fetch: FetchLike;
};

const HELP = `Hierophant checks what a repo will make your AI agent do. It never runs repo content.

Usage
  hierophant scan [folder]  Check a local folder
    --fail-on <level>       critical, high, medium, low, or none (default: high)
    --format <format>       text or json (default: text)
    --online                Look up package names in OSV, npm, and PyPI

  hierophant lock           Preview safer settings for your AI agents
    --apply                 Write the settings, after making a backup
    --undo                  Restore the settings from the latest backup
    --agent <id>            Limit to one agent. Can be repeated.
                            ${LOCK_AGENTS.join(", ")}

  hierophant mcp            Start a read-only MCP server over stdio
    --root <folder>         Folder it may check. Can be repeated. (default: current folder)

  hierophant --version
  hierophant --help

Exit codes
  0  Finished, and nothing reached --fail-on
  1  Findings reached --fail-on, or a settings file could not be changed
  2  Invalid usage

A result is not a guarantee.
`;

async function resolveDirectory(input: string, cwd: string): Promise<string> {
  try {
    const target = await realpath(resolve(cwd, input));
    if ((await stat(target)).isDirectory()) return target;
  } catch {
    // Reported below with one clear message.
  }
  throw new UsageError("That folder does not exist.");
}

function parse(argv: string[], options: NonNullable<ParseArgsConfig["options"]>) {
  try {
    return parseArgs({ args: argv, options, allowPositionals: true, strict: true });
  } catch {
    throw new UsageError("Unknown or incomplete option. Run hierophant --help.");
  }
}

async function runScan(argv: string[], io: CliIo): Promise<number> {
  const { values, positionals } = parse(argv, {
    "fail-on": { type: "string" },
    format: { type: "string" },
    online: { type: "boolean" },
  });
  if (positionals.length > 1) throw new UsageError("Pass one folder at a time.");
  const failOn = parseFailOn(values["fail-on"] as string | undefined);
  const format = (values.format as string | undefined) ?? "text";
  if (format !== "text" && format !== "json") {
    throw new UsageError("--format must be text or json.");
  }

  const root = await resolveDirectory(positionals[0] ?? ".", io.cwd);
  const scanned = await scanDirectoryWithPackages(root);
  // Only package names and versions leave this computer, and only with --online.
  const packages: PackageSummary | null =
    values.online && scanned.packages.length > 0
      ? await checkPackages(scanned.packages, { fetch: io.fetch })
      : null;
  const result = {
    ...scanned.result,
    status: combineStatus(scanned.result.status, packages),
  };
  const packageFindings = (packages?.checks ?? []).flatMap((check) => {
    const severity = packageSeverity(check.verdict);
    return severity ? [{ severity }] : [];
  });
  const thresholdReached = reachesThreshold([...result.findings, ...packageFindings], failOn);
  const unchecked = values.online ? 0 : scanned.packages.length;
  io.stdout(
    format === "json"
      ? formatJson(result, failOn, thresholdReached, packages)
      : formatText(result, io.color, packages, unchecked),
  );
  return thresholdReached ? 1 : 0;
}

function shortenHome(file: string, home: string): string {
  return file === home || file.startsWith(`${home}${sep}`) ? `~${file.slice(home.length)}` : file;
}

function formatPlan(plan: readonly LockEntry[], home: string): string {
  const lines: string[] = [];
  for (const entry of plan) {
    const where = entry.file ? `  ${shortenHome(entry.file, home)}` : "";
    lines.push(`${entry.label}${where}`);
    if (entry.reason) lines.push(`  ${entry.reason}`);
    for (const change of entry.changes) {
      lines.push(`  change  ${change.key}: ${change.current} -> ${change.target}`);
      lines.push(`          ${change.effect}`);
    }
    for (const key of entry.kept) lines.push(`  ok      ${key}`);
    lines.push("");
  }
  return lines.join("\n");
}

async function runLock(argv: string[], io: CliIo): Promise<number> {
  const { values, positionals } = parse(argv, {
    apply: { type: "boolean" },
    undo: { type: "boolean" },
    agent: { type: "string", multiple: true },
  });
  if (positionals.length > 0) throw new UsageError("lock does not take a folder.");
  if (values.apply && values.undo) throw new UsageError("Use --apply or --undo, not both.");

  const report = (results: ReadonlyArray<{ label: string; ok: boolean; message: string }>) => {
    for (const result of results) io.stdout(`${result.label}: ${result.message}\n`);
    return results.every((result) => result.ok) ? 0 : 1;
  };

  if (values.undo) {
    if (values.agent) throw new UsageError("--undo restores the whole latest lock.");
    const results = await undoLock(io);
    if (!results) {
      io.stdout("There is no lock to undo.\n");
      return 0;
    }
    return report(results);
  }

  const plan = await planLock(io, (values.agent as string[] | undefined) ?? []);
  io.stdout(`Hierophant lock${values.apply ? "" : " (preview)"}\n\n${formatPlan(plan, io.home)}`);
  const pending = plan.some((entry) => entry.state === "ready");

  if (!values.apply) {
    io.stdout(
      pending
        ? "Nothing was changed. Run hierophant lock --apply to write these settings.\n"
        : "Nothing needs to change.\n",
    );
  } else if (!pending) {
    io.stdout("Nothing needs to change.\n");
  } else {
    const code = report(await applyLock(io, plan));
    io.stdout("Run hierophant lock --undo to restore the previous settings.\n");
    io.stdout("These settings reduce risk. They are not a guarantee.\n");
    return code;
  }
  io.stdout("These settings reduce risk. They are not a guarantee.\n");
  return 0;
}

async function runMcp(argv: string[], io: CliIo): Promise<number> {
  const { values, positionals } = parse(argv, { root: { type: "string", multiple: true } });
  if (positionals.length > 0) throw new UsageError("Use --root to choose a folder.");
  const inputs = (values.root as string[] | undefined) ?? ["."];
  const roots = await Promise.all(inputs.map((root) => resolveDirectory(root, io.cwd)));
  const { startMcpServer } = await import("./mcp.js");
  await startMcpServer(roots);
  return 0;
}

export async function runCli(argv: string[], io: CliIo): Promise<number> {
  const [command, ...rest] = argv;
  try {
    switch (command) {
      case undefined:
      case "help":
      case "--help":
      case "-h":
        io.stdout(HELP);
        return 0;
      case "--version":
      case "-v":
        io.stdout(`hierophant ${ENGINE_VERSION} (ruleset ${RULESET_VERSION})\n`);
        return 0;
      case "scan":
        return await runScan(rest, io);
      case "lock":
        return await runLock(rest, io);
      case "mcp":
        return await runMcp(rest, io);
      default:
        throw new UsageError("Unknown command. Run hierophant --help.");
    }
  } catch (error) {
    if (error instanceof UsageError) {
      io.stderr(`${error.message}\n`);
      return 2;
    }
    // System error messages can quote paths from the scanned folder.
    io.stderr("Hierophant could not finish.\n");
    return 1;
  }
}
