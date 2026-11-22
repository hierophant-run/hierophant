import type { ConfigKind } from "../targets.js";
import { asString, entryOf, get, type TreeNode } from "../tree.js";
import type { Reporter } from "./reporter.js";

const UNRESTRICTED_SHELL = new Set(["Bash", "Bash(*)", "Bash(:*)", "*"]);
const UNRESTRICTED_GEMINI_SHELL = new Set([
  "run_shell_command",
  "ShellTool",
  "run_shell_command(*)",
]);

const VSCODE_FLAGS: ReadonlyArray<readonly [string, boolean | string]> = [
  ["chat.tools.global.autoApprove", true],
  ["chat.tools.autoApprove", true],
  ["chat.tools.terminal.ignoreDefaultAutoApproveRules", true],
  ["chat.tools.terminal.autoReplyToPrompts", true],
  ["github.copilot.chat.claudeAgent.allowDangerouslySkipPermissions", true],
  ["security.workspace.trust.enabled", false],
  ["task.allowAutomaticTasks", "on"],
  ["chat.permissions.default", "autoApprove"],
  ["chat.permissions.default", "autopilot"],
];

function scalarEquals(node: TreeNode | undefined, expected: boolean | string): boolean {
  return node?.kind === "scalar" && node.value === expected;
}

function checkClaude(root: TreeNode, report: Reporter): void {
  const permissions = get(root, "permissions");
  const mode = entryOf(permissions, "defaultMode");
  if (mode && ["bypassPermissions", "auto"].includes(asString(mode.value) ?? "")) {
    report("PERM-001", mode.keyOffset);
  }
  const allow = get(permissions, "allow");
  if (allow?.kind === "array") {
    for (const item of allow.items) {
      const value = asString(item);
      if (value !== undefined && UNRESTRICTED_SHELL.has(value.replace(/\s/g, ""))) {
        report("PERM-001", item.offset);
      }
    }
  }
  for (const key of ["skipDangerousModePermissionPrompt", "enableAllProjectMcpServers"]) {
    const entry = entryOf(root, key);
    if (entry && scalarEquals(entry.value, true)) {
      // Only approves servers the repository already declares, and only in a trusted folder.
      const options =
        key === "enableAllProjectMcpServers" ? ({ severity: "medium" } as const) : undefined;
      report("PERM-001", entry.keyOffset, options);
    }
  }
}

function checkGemini(root: TreeNode, report: Reporter): void {
  const allowed = get(root, "tools", "allowed");
  if (allowed?.kind === "array") {
    for (const item of allowed.items) {
      const value = asString(item);
      if (value !== undefined && UNRESTRICTED_GEMINI_SHELL.has(value)) {
        report("PERM-001", item.offset);
      }
    }
  }
  const servers = get(root, "mcpServers");
  if (servers?.kind === "object") {
    for (const server of servers.entries) {
      const trust = entryOf(server.value, "trust");
      if (trust && scalarEquals(trust.value, true)) report("PERM-001", trust.keyOffset);
    }
  }
}

function checkVsCode(root: TreeNode, report: Reporter): void {
  for (const [key, dangerous] of VSCODE_FLAGS) {
    const entry = entryOf(root, key);
    if (entry && scalarEquals(entry.value, dangerous)) report("PERM-001", entry.keyOffset);
  }

  const configuration = entryOf(root, "chat.defaultConfiguration");
  if (configuration && scalarEquals(get(configuration.value, "approvals"), "allowAll")) {
    report("PERM-001", configuration.keyOffset);
  }

  const terminal = get(root, "chat.tools.terminal.autoApprove");
  if (terminal?.kind === "object") {
    for (const entry of terminal.entries) {
      const isWildcard = ["*", "/.*/", "/.+/", "/^.*$/"].includes(entry.key);
      if (isWildcard && scalarEquals(entry.value, true)) report("PERM-001", entry.keyOffset);
    }
  }
}

export function runPermissionRules(
  kind: ConfigKind | undefined,
  root: TreeNode | undefined,
  report: Reporter,
): void {
  if (!root) return;
  if (kind === "claude-settings") checkClaude(root, report);
  if (kind === "gemini-settings") checkGemini(root, report);
  if (kind === "vscode-settings") checkVsCode(root, report);
}
