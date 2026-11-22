import type { AgentId, Impact } from "@hierophant/engine";

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

export const IMPACT_DOT_CLASSES: Record<Impact, string> = {
  runs_on_open: "bg-danger",
  runs_after_trust_prompt: "bg-danger",
  steers_agent: "bg-dot",
  behavior_unknown: "bg-dot",
  not_detected: "bg-muted",
};

export const SUPPORTED_TOOLS = [
  { name: "Claude Code", files: [".claude/", "CLAUDE.md", ".mcp.json"] },
  { name: "Cursor", files: [".cursor/", ".cursorrules", "AGENTS.md"] },
  {
    name: "VS Code",
    files: [".vscode/tasks.json", ".vscode/mcp.json", ".github/hooks/", ".devcontainer/"],
  },
  { name: "Antigravity CLI", files: [".agents/", "AGENTS.md", "GEMINI.md"] },
  { name: "Gemini CLI", files: [".gemini/", "GEMINI.md"] },
];
