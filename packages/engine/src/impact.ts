import { classifyPath } from "./targets.js";
import type { Finding } from "./types.js";

export const AGENTS = ["claude-code", "cursor", "vscode", "antigravity-cli", "gemini-cli"] as const;
export type AgentId = (typeof AGENTS)[number];

export type Impact =
  "runs_on_open" | "runs_after_trust_prompt" | "steers_agent" | "behavior_unknown" | "not_detected";

export type ImpactFinding = {
  ruleId: string;
  path: string;
  line: number;
  impact: Impact;
  note: string;
  source?: string;
};

export type AgentImpact = {
  agent: AgentId;
  impact: Impact;
  findings: ImpactFinding[];
};

export type Surface =
  | "session_hook"
  | "event_hook"
  | "mcp_server"
  | "instructions"
  | "approval_setting"
  | "helper_command"
  | "folder_open_task"
  | "devcontainer";

export type AgentBehavior = {
  impact: Exclude<Impact, "not_detected">;
  note: string;
  source: string;
};

/** Date the official documentation behind AGENT_BEHAVIOR was last read. */
export const BEHAVIOR_CHECKED_ON = "2026-11-22";

const CLAUDE_HOOKS = "https://code.claude.com/docs/en/hooks#workspace-trust";
const CLAUDE_TRUST =
  "https://code.claude.com/docs/en/permissions#what-runs-before-you-trust-a-folder";
const CURSOR_HOOKS = "https://cursor.com/docs/agent/hooks";
const CURSOR_SECURITY = "https://cursor.com/docs/agent/security";
const VSCODE_TRUST = "https://code.visualstudio.com/docs/editing/workspaces/workspace-trust";
const GEMINI_TRUST = "https://geminicli.com/docs/cli/trusted-folders/";

const claudeHook: AgentBehavior = {
  impact: "runs_after_trust_prompt",
  note: "Interactive sessions hold this back until you accept the trust dialog. claude -p and SDK sessions run it without asking.",
  source: CLAUDE_HOOKS,
};

const cursorHook: AgentBehavior = {
  impact: "behavior_unknown",
  note: "Cursor documents that project hooks need a trusted workspace and that workspace trust is off by default, but not what happens to hooks while it is off.",
  source: CURSOR_HOOKS,
};

const vscodeAgent: AgentBehavior = {
  impact: "runs_after_trust_prompt",
  note: "Restricted Mode disables agents, so this needs the workspace to be trusted first.",
  source: VSCODE_TRUST,
};

const geminiSetting: AgentBehavior = {
  impact: "behavior_unknown",
  note: "With folder trust on, untrusted folders ignore project settings. The official docs disagree on whether it is on by default, so that case is not fully documented.",
  source: GEMINI_TRUST,
};

const antigravityHook: AgentBehavior = {
  impact: "behavior_unknown",
  note: "Project hooks can run commands during a session. Antigravity does not document whether workspace trust holds them back.",
  source: "https://antigravity.google/docs/hooks",
};

/** Each entry restates official documentation. Anything undocumented stays behavior_unknown. */
export const AGENT_BEHAVIOR: Record<AgentId, Partial<Record<Surface, AgentBehavior>>> = {
  "claude-code": {
    session_hook: claudeHook,
    event_hook: claudeHook,
    mcp_server: {
      impact: "runs_after_trust_prompt",
      note: "Interactive sessions ask before connecting servers from .mcp.json. claude -p connects them without asking.",
      source: CLAUDE_TRUST,
    },
    instructions: {
      impact: "steers_agent",
      note: "Loaded into the agent's context at launch. It runs nothing by itself but can direct what the agent does.",
      source: "https://code.claude.com/docs/en/memory",
    },
    approval_setting: {
      impact: "runs_after_trust_prompt",
      note: "Project allow rules apply only after you trust the folder. Current versions ignore auto and bypassPermissions from project settings.",
      source: CLAUDE_TRUST,
    },
    helper_command: {
      impact: "runs_after_trust_prompt",
      note: "Helper commands are used in claude -p and SDK sessions without a trust dialog, and in folders whose parent you trusted.",
      source: CLAUDE_TRUST,
    },
  },
  cursor: {
    session_hook: cursorHook,
    event_hook: cursorHook,
    mcp_server: {
      impact: "runs_after_trust_prompt",
      note: "Cursor documents that MCP connections need your approval.",
      source: CURSOR_SECURITY,
    },
    instructions: {
      impact: "steers_agent",
      note: "Project rules and AGENTS.md are loaded automatically and can direct the agent.",
      source: "https://cursor.com/docs/context/rules",
    },
    approval_setting: {
      impact: "behavior_unknown",
      note: "Cursor does not document how project files affect approvals.",
      source: CURSOR_SECURITY,
    },
    folder_open_task: {
      impact: "behavior_unknown",
      note: "Cursor does not document automatic tasks, and its workspace trust is off by default.",
      source: CURSOR_SECURITY,
    },
  },
  vscode: {
    session_hook: vscodeAgent,
    event_hook: vscodeAgent,
    mcp_server: {
      impact: "runs_after_trust_prompt",
      note: "Workspace MCP configurations inherit Workspace Trust and can start without a separate prompt once you trust the project.",
      source: "https://code.visualstudio.com/docs/copilot/security",
    },
    instructions: {
      impact: "steers_agent",
      note: "Instruction files are added to the agent's context and can direct it.",
      source: "https://code.visualstudio.com/docs/copilot/customization/custom-instructions",
    },
    approval_setting: {
      impact: "runs_after_trust_prompt",
      note: "VS Code disables a set of workspace settings in Restricted Mode.",
      source: VSCODE_TRUST,
    },
    folder_open_task: {
      impact: "runs_after_trust_prompt",
      note: "Never runs in an untrusted workspace. Once trusted, VS Code asks once to allow automatic tasks unless a choice is already saved.",
      source: "https://code.visualstudio.com/docs/debugtest/tasks",
    },
    devcontainer: {
      impact: "runs_after_trust_prompt",
      note: "Setting up a dev container requires trusting the folder.",
      source: "https://code.visualstudio.com/docs/devcontainers/containers",
    },
  },
  "antigravity-cli": {
    session_hook: antigravityHook,
    event_hook: antigravityHook,
    mcp_server: {
      impact: "behavior_unknown",
      note: "MCP tools ask for approval by default. Antigravity does not document whether workspace trust controls starting a project server.",
      source: "https://antigravity.google/docs/mcp",
    },
    instructions: {
      impact: "steers_agent",
      note: "AGENTS.md, GEMINI.md, and .agents rules are loaded automatically and can direct the agent.",
      source: "https://antigravity.google/docs/rules",
    },
  },
  "gemini-cli": {
    session_hook: geminiSetting,
    event_hook: geminiSetting,
    mcp_server: geminiSetting,
    approval_setting: geminiSetting,
    instructions: {
      impact: "steers_agent",
      note: "GEMINI.md files are loaded automatically and can direct the agent.",
      source: "https://geminicli.com/docs/cli/gemini-md/",
    },
  },
};

const IMPACT_RANK: Record<Impact, number> = {
  runs_on_open: 0,
  runs_after_trust_prompt: 1,
  behavior_unknown: 2,
  steers_agent: 3,
  not_detected: 4,
};

const baseName = (path: string) => path.slice(path.lastIndexOf("/") + 1);
const directoryOf = (path: string) => path.slice(0, path.lastIndexOf("/") + 1);

function agentsFor(path: string, scannedPaths: ReadonlySet<string>): AgentId[] {
  const name = baseName(path);

  if (/(?:^|\/)\.agents?\//.test(path)) return ["antigravity-cli"];
  if (path.startsWith(".claude/") || name === "CLAUDE.local.md") return ["claude-code"];
  if (name === "CLAUDE.md") return ["claude-code", "vscode"];
  if (path === ".mcp.json") return ["claude-code", "vscode"];
  if (path.startsWith(".cursor/") || path === ".cursorrules") return ["cursor"];
  if (path === ".vscode/tasks.json") return ["vscode", "cursor"];
  if (path.startsWith(".vscode/")) return ["vscode"];
  if (path === ".github/copilot-instructions.md" || path.startsWith(".github/hooks/")) {
    return ["vscode"];
  }
  if (path.startsWith(".gemini/")) return ["gemini-cli"];
  if (name === "GEMINI.md") return ["antigravity-cli", "gemini-cli"];
  if (path === ".devcontainer.json" || path.startsWith(".devcontainer/")) return ["vscode"];
  if (name === "AGENTS.md") {
    // Claude Code reads AGENTS.md only where no CLAUDE.md exists.
    return scannedPaths.has(`${directoryOf(path)}CLAUDE.md`)
      ? ["cursor", "vscode", "antigravity-cli"]
      : ["claude-code", "cursor", "vscode", "antigravity-cli"];
  }
  return [];
}

function surfaceOf(finding: Finding, sessionHookLines: ReadonlySet<string>): Surface | null {
  const { ruleId, path, line } = finding;
  const hookSurface: Surface = sessionHookLines.has(`${path}:${line}`)
    ? "session_hook"
    : "event_hook";
  const target = classifyPath(path);

  if (ruleId === "AUTO-001") return "session_hook";
  if (ruleId === "AUTO-002") return hookSurface;
  if (ruleId === "AUTO-003") return "folder_open_task";
  if (ruleId === "AUTO-004" || ruleId === "AUTO-006") return "devcontainer";
  if (ruleId === "AUTO-007") return "helper_command";
  if (ruleId === "PERM-001") return "approval_setting";
  if (ruleId.startsWith("MCP-")) return "mcp_server";
  if (ruleId.startsWith("INJ-")) return target?.text === "instruction" ? "instructions" : null;

  if (ruleId.startsWith("EXEC-")) {
    if (target?.text === "instruction") return "instructions";
    if (
      target?.config === "hooks" ||
      target?.config === "antigravity-hooks" ||
      target?.config === "claude-settings" ||
      target?.config === "gemini-settings"
    ) {
      return hookSurface;
    }
    if (target?.config === "devcontainer") return "devcontainer";
    if (target?.config === "mcp") return "mcp_server";
  }
  // npm scripts and manually started tasks do not run because a repository was opened.
  return null;
}

function compareImpactFindings(a: ImpactFinding, b: ImpactFinding): number {
  return (
    IMPACT_RANK[a.impact] - IMPACT_RANK[b.impact] ||
    (a.path < b.path ? -1 : a.path > b.path ? 1 : 0) ||
    a.line - b.line ||
    (a.ruleId < b.ruleId ? -1 : a.ruleId > b.ruleId ? 1 : 0)
  );
}

/** Translates findings into what each agent would do with this repository. */
export function computeImpact(
  findings: readonly Finding[],
  scannedPaths: ReadonlySet<string>,
): AgentImpact[] {
  const sessionHookLines = new Set(
    findings.filter((f) => f.ruleId === "AUTO-001").map((f) => `${f.path}:${f.line}`),
  );
  const byAgent = new Map<AgentId, ImpactFinding[]>(AGENTS.map((agent) => [agent, []]));

  for (const finding of findings) {
    const surface = surfaceOf(finding, sessionHookLines);
    if (!surface) continue;

    for (const agent of agentsFor(finding.path, scannedPaths)) {
      const behavior = AGENT_BEHAVIOR[agent][surface];
      byAgent.get(agent)!.push({
        ruleId: finding.ruleId,
        path: finding.path,
        line: finding.line,
        impact: behavior?.impact ?? "behavior_unknown",
        note: behavior?.note ?? "The official documentation does not describe this behavior.",
        ...(behavior ? { source: behavior.source } : {}),
      });
    }
  }

  return AGENTS.map((agent) => {
    const agentFindings = byAgent.get(agent)!.sort(compareImpactFindings);
    return {
      agent,
      impact: agentFindings[0]?.impact ?? "not_detected",
      findings: agentFindings,
    };
  });
}
