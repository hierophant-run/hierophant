import type { Severity } from "./types.js";

export const RULESET_VERSION = "0.3.0";

export type RuleDefinition = {
  severity: Severity;
  title: string;
  why: string;
  fix: string;
};

export const RULES = {
  "AUTO-001": {
    severity: "medium",
    title: "Agent hook runs when a session starts",
    why: "This hook can run a command as soon as an AI coding agent starts in this repository, before you ask it to do anything.",
    fix: "Read the hook before opening the repo with an agent. Remove it unless you trust what it runs.",
  },
  "AUTO-002": {
    severity: "critical",
    title: "Agent hook reaches the network or runs a concealed script",
    why: "Hooks run automatically during agent work. One that contacts a remote host or launches a hidden script can steal data or install malware.",
    fix: "Do not open this repo with an agent until the hook is removed or replaced with a reviewed local command.",
  },
  "AUTO-003": {
    severity: "medium",
    title: "Editor task runs when the folder opens",
    why: "A task with runOn set to folderOpen can execute a command when the repository is opened in VS Code or a compatible editor.",
    fix: 'Review the task command. Remove "runOn": "folderOpen" unless you trust it.',
  },
  "AUTO-004": {
    severity: "high",
    title: "Dev container downloads and runs code",
    why: "A lifecycle command fetches code from the network and executes it while the dev container is being set up.",
    fix: "Replace it with a pinned, checksummed install step, or remove it before building the container.",
  },
  "AUTO-005": {
    severity: "high",
    title: "Suspicious npm install script",
    why: "npm runs lifecycle scripts automatically during install. This one reaches the network, decodes a payload, or launches a concealed script.",
    fix: "Review the script. Until then, install with --ignore-scripts.",
  },
  "AUTO-006": {
    severity: "medium",
    title: "Dev container command runs on your host machine",
    why: "initializeCommand runs on your computer, outside the container, so the container gives it no isolation.",
    fix: "Read the command before building the container. Remove it unless you trust it.",
  },
  "AUTO-007": {
    severity: "medium",
    title: "Agent setting runs a helper command",
    why: "This setting tells the agent to execute a command from the repository, for example to fetch credentials or draw a status line.",
    fix: "Review the command, or remove the setting if the repository does not need it.",
  },
  "EXEC-001": {
    severity: "critical",
    title: "Remote code is piped into a shell",
    why: "This downloads code and runs it immediately, so nobody can review what actually executes and the server can change it at any time.",
    fix: "Download to a file, verify a checksum, review it, then run it.",
  },
  "EXEC-002": {
    severity: "critical",
    title: "Encoded payload is decoded and executed",
    why: "Encoding hides the real command from reviewers. Legitimate setup steps rarely need to decode and run code.",
    fix: "Decode it in a text editor without running it, then remove it unless you can explain every step.",
  },
  "EXEC-003": {
    severity: "high",
    title: "Configuration runs a heavily obfuscated script",
    why: "The script is packed so it cannot be read, which is a common way to hide malware in repository tooling.",
    fix: "Do not run it. Ask the maintainer for the readable source, or remove the reference.",
  },
  "MCP-001": {
    severity: "medium",
    title: "MCP server package is not pinned",
    why: "The server is downloaded at launch without an exact version, so a future or compromised release runs automatically.",
    fix: "Pin an exact version, for example package@1.2.3.",
  },
  "MCP-002": {
    severity: "medium",
    title: "MCP server connects to an unrecognized remote host",
    why: "A remote MCP server receives what your agent sends it and can return instructions the agent may follow.",
    fix: "Confirm who operates this host. Remove the server if you do not recognize it.",
  },
  "MCP-003": {
    severity: "high",
    title: "Credential is written into an MCP configuration",
    why: "A secret committed to the repository can be read by anyone with access and is handed to the MCP server at launch.",
    fix: "Revoke this credential and load the value from an environment variable instead.",
  },
  "MCP-004": {
    severity: "high",
    title: "MCP server is launched through a shell",
    why: "A shell wrapper lets a single configuration entry chain extra commands that run whenever the server starts.",
    fix: "Launch the server executable directly, with its arguments in the args array.",
  },
  "INJ-001": {
    severity: "high",
    title: "Hidden Unicode characters",
    why: "Invisible characters can carry instructions that an AI model reads but a human reviewer cannot see.",
    fix: "Inspect the escaped characters shown here and delete them from the file.",
  },
  "INJ-002": {
    severity: "high",
    title: "Instruction tries to override rules or hide actions",
    why: "This text tells an agent to ignore its instructions or keep something from you, a common prompt injection pattern.",
    fix: "Remove the instruction. If it is only an example, move it out of files that agents load.",
  },
  "INJ-003": {
    severity: "critical",
    title: "Instruction targets credentials",
    why: "This text asks an agent to read or send sensitive files or secrets, which can leak your credentials.",
    fix: "Do not open this repo with an agent. If it already ran, rotate the affected credentials.",
  },
  "INJ-004": {
    severity: "medium",
    title: "Instruction hidden in an HTML comment",
    why: "HTML comments do not appear in rendered Markdown, but an agent may still read them as instructions.",
    fix: "View the raw file and remove any comment that tells the agent what to do.",
  },
  "PERM-001": {
    severity: "high",
    title: "Agent approvals are weakened",
    why: "This setting broadens what the agent may do without asking you, so a malicious instruction can act without a prompt.",
    fix: "Remove the setting and keep approval prompts on for this repository.",
  },
} as const satisfies Record<string, RuleDefinition>;

export type RuleId = keyof typeof RULES;
