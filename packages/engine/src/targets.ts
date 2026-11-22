export type ConfigKind =
  | "claude-settings"
  | "gemini-settings"
  | "vscode-settings"
  | "vscode-tasks"
  | "devcontainer"
  | "package"
  | "mcp"
  | "hooks"
  | "antigravity-hooks";

export type TextKind = "instruction" | "script" | "data";

export type Target = {
  config?: ConfigKind;
  format?: "json" | "yaml";
  text: TextKind;
};

const AGENT_DIRS = [
  ".claude/",
  ".gemini/",
  ".cursor/",
  ".windsurf/",
  ".devin/",
  ".continue/",
  ".cline/",
  ".clinerules/",
  ".devcontainer/",
];

const INSTRUCTION_NAMES = new Set([
  "CLAUDE.md",
  "CLAUDE.local.md",
  "AGENTS.md",
  "AGENTS.local.md",
  "AGENT.md",
  "GEMINI.md",
]);

const ROOT_INSTRUCTIONS = new Set([
  ".cursorrules",
  ".windsurfrules",
  ".clinerules",
  ".github/copilot-instructions.md",
]);

const EXACT_CONFIGS: Record<string, ConfigKind> = {
  ".claude/settings.json": "claude-settings",
  ".claude/settings.local.json": "claude-settings",
  ".claude/hooks/hooks.json": "hooks",
  ".gemini/settings.json": "gemini-settings",
  ".vscode/settings.json": "vscode-settings",
  ".vscode/tasks.json": "vscode-tasks",
  ".vscode/mcp.json": "mcp",
  ".devcontainer.json": "devcontainer",
  ".devcontainer/devcontainer.json": "devcontainer",
  ".mcp.json": "mcp",
  ".cursor/mcp.json": "mcp",
  ".cursor/hooks.json": "hooks",
  ".devin/mcp_config.json": "mcp",
  ".devin/mcp_config.local.json": "mcp",
  ".devin/hooks.v1.json": "hooks",
  ".windsurf/mcp_config.json": "mcp",
  ".windsurf/hooks.json": "hooks",
  "package.json": "package",
};

/** Antigravity reads these folders in the workspace and in parents up to the repo root. */
const ANTIGRAVITY_DIR = /(?:^|\/)\.agents?\//;
const ANTIGRAVITY_HOOKS = /(?:^|\/)\.agents\/(?:plugins\/[^/]+\/)?hooks\.json$/;
const ANTIGRAVITY_MCP = /(?:^|\/)\.agents\/(?:plugins\/[^/]+\/)?mcp_config\.json$/;

const INSTRUCTION_EXTENSIONS = new Set(["md", "mdc", "markdown", "txt"]);
const SCRIPT_EXTENSIONS = new Set([
  "sh",
  "bash",
  "zsh",
  "js",
  "mjs",
  "cjs",
  "ts",
  "py",
  "ps1",
  "rb",
  "pl",
  "bat",
  "cmd",
]);

function extensionOf(path: string): string {
  const name = path.slice(path.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

/** Returns a clean repo-relative path, or null when the path cannot be trusted. */
export function normalizePath(path: string): string | null {
  if (!path || path.includes("\0")) return null;
  const unified = path.replace(/\\/g, "/").replace(/^(?:\.\/)+/, "");
  if (!unified || unified.startsWith("/") || /^[a-zA-Z]:/.test(unified)) return null;
  const parts = unified.split("/");
  if (parts.some((part) => part === ".." || part === "." || part === "")) return null;
  return unified;
}

export function classifyPath(path: string): Target | null {
  if (path.split("/").includes("node_modules")) return null;

  const exact = EXACT_CONFIGS[path];
  if (exact) return { config: exact, format: "json", text: "data" };

  if (/^\.devcontainer\/[^/]+\/devcontainer\.json$/.test(path)) {
    return { config: "devcontainer", format: "json", text: "data" };
  }
  if (ANTIGRAVITY_HOOKS.test(path)) {
    return { config: "antigravity-hooks", format: "json", text: "data" };
  }
  if (ANTIGRAVITY_MCP.test(path)) return { config: "mcp", format: "json", text: "data" };
  if (/^\.github\/hooks\/[^/]+\.json$/.test(path)) {
    return { config: "hooks", format: "json", text: "data" };
  }

  const extension = extensionOf(path);
  if (path.startsWith(".continue/mcpServers/")) {
    if (extension === "json") return { config: "mcp", format: "json", text: "data" };
    if (extension === "yaml" || extension === "yml") {
      return { config: "mcp", format: "yaml", text: "data" };
    }
  }

  const name = path.slice(path.lastIndexOf("/") + 1);
  if (INSTRUCTION_NAMES.has(name) || ROOT_INSTRUCTIONS.has(path)) return { text: "instruction" };

  if (AGENT_DIRS.some((dir) => path.startsWith(dir)) || ANTIGRAVITY_DIR.test(path)) {
    if (INSTRUCTION_EXTENSIONS.has(extension)) return { text: "instruction" };
    if (SCRIPT_EXTENSIONS.has(extension) || name === "Dockerfile") return { text: "script" };
    if (["json", "jsonc", "yaml", "yml", "toml"].includes(extension)) return { text: "data" };
  }

  return null;
}

/** Lower ranks are read first when a scan cannot read every file. */
export function agentFileRank(path: string): number {
  const normalized = normalizePath(path);
  const target = normalized === null ? null : classifyPath(normalized);
  if (!target) return 4;
  if (target.config) return 0;
  if (target.text === "instruction") return 1;
  return target.text === "script" ? 2 : 3;
}

/** True when a repository file should be fetched and scanned. */
export function isAgentFile(path: string): boolean {
  const normalized = normalizePath(path);
  return normalized !== null && classifyPath(normalized) !== null;
}
