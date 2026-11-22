import type { ConfigKind } from "./targets.js";
import { asString, asStrings, entryOf, get, type TreeNode } from "./tree.js";

export type CommandFact = {
  source: "hook" | "task" | "devcontainer" | "npm" | "helper";
  text: string;
  offset: number;
  event?: string;
  autoStart?: boolean;
  /** Remote endpoint of an HTTP hook. */
  url?: string;
};

export type McpValue = { key: string; value: string; offset: number };

export type McpServer = {
  name: string;
  offset: number;
  command?: string;
  commandOffset: number;
  args: string[];
  argsOffset: number;
  env: McpValue[];
  headers: McpValue[];
  url?: string;
  urlOffset: number;
};

const AUTO_START_EVENTS = new Set([
  "SessionStart",
  "InstructionsLoaded",
  "sessionStart",
  "workspaceOpen",
]);

const CLAUDE_HELPER_KEYS = [
  "apiKeyHelper",
  "awsAuthRefresh",
  "awsCredentialExport",
  "gcpAuthRefresh",
  "otelHeadersHelper",
];

const DEVCONTAINER_COMMANDS = [
  "initializeCommand",
  "onCreateCommand",
  "updateContentCommand",
  "postCreateCommand",
  "postStartCommand",
  "postAttachCommand",
];

const NPM_LIFECYCLE = [
  "preinstall",
  "install",
  "postinstall",
  "prepublish",
  "preprepare",
  "prepare",
  "postprepare",
];

function joinCommand(commandNode: TreeNode | undefined, argsNode: TreeNode | undefined): string {
  const command = asString(commandNode);
  if (command === undefined) return "";
  return [command, ...asStrings(argsNode)].join(" ");
}

function hookFacts(root: TreeNode): CommandFact[] {
  const hooks = get(root, "hooks") ?? root;
  if (hooks.kind !== "object") return [];

  const facts: CommandFact[] = [];
  for (const { key: event, value } of hooks.entries) {
    if (value.kind !== "array") continue;
    const autoStart = AUTO_START_EVENTS.has(event);

    for (const group of value.items) {
      const nested = get(group, "hooks");
      const handlers = nested?.kind === "array" ? nested.items : [group];

      for (const handler of handlers) {
        if (handler.kind !== "object") continue;
        const type = asString(get(handler, "type")) ?? "command";
        const offset = handler.offset;

        if (type === "command") {
          // Copilot hooks can name a separate command per shell.
          for (const key of ["command", "bash", "powershell"]) {
            const commandEntry = entryOf(handler, key);
            const text = joinCommand(commandEntry?.value, get(handler, "args"));
            if (commandEntry && text) {
              facts.push({
                source: "hook",
                text,
                event,
                autoStart,
                offset: commandEntry.keyOffset,
              });
            }
          }
        } else if (type === "http") {
          const urlEntry = entryOf(handler, "url");
          const url = asString(urlEntry?.value);
          if (url) {
            facts.push({
              source: "hook",
              text: url,
              url,
              event,
              autoStart,
              offset: urlEntry?.keyOffset ?? offset,
            });
          }
        } else if (type === "mcp_tool") {
          facts.push({ source: "hook", text: "", event, autoStart, offset });
        }
      }
    }
  }
  return facts;
}

/** Antigravity groups events under a named hook, which can be switched off. */
function antigravityHookFacts(root: TreeNode): CommandFact[] {
  if (root.kind !== "object") return [];
  return root.entries.flatMap(({ value }) => {
    if (value.kind !== "object") return [];
    const enabled = get(value, "enabled");
    if (enabled?.kind === "scalar" && enabled.value === false) return [];
    return hookFacts({
      kind: "object",
      offset: value.offset,
      entries: value.entries.filter((entry) => entry.key !== "hooks"),
    });
  });
}

function helperFacts(root: TreeNode): CommandFact[] {
  const facts: CommandFact[] = [];
  for (const key of CLAUDE_HELPER_KEYS) {
    const entry = entryOf(root, key);
    const text = asString(entry?.value);
    if (entry && text) facts.push({ source: "helper", text, event: key, offset: entry.keyOffset });
  }
  for (const key of ["statusLine", "fileSuggestion"]) {
    const entry = entryOf(get(root, key), "command");
    const text = asString(entry?.value);
    if (entry && text) facts.push({ source: "helper", text, event: key, offset: entry.keyOffset });
  }
  return facts;
}

export type TaskRun = { offset: number };

function taskCommandFacts(task: TreeNode): CommandFact[] {
  const facts: CommandFact[] = [];
  for (const scope of [task, get(task, "windows"), get(task, "osx"), get(task, "linux")]) {
    const entry = entryOf(scope, "command");
    if (!entry) continue;
    const text = joinCommand(entry.value, get(scope, "args") ?? get(task, "args"));
    if (text) facts.push({ source: "task", text, offset: entry.keyOffset });
  }
  return facts;
}

export function folderOpenTasks(root: TreeNode | undefined): TaskRun[] {
  const tasks = get(root, "tasks");
  if (tasks?.kind !== "array") return [];
  const runs: TaskRun[] = [];
  for (const task of tasks.items) {
    const entry = entryOf(get(task, "runOptions"), "runOn");
    if (entry && asString(entry.value) === "folderOpen") runs.push({ offset: entry.keyOffset });
  }
  return runs;
}

function devcontainerFacts(root: TreeNode): CommandFact[] {
  const facts: CommandFact[] = [];
  const toText = (node: TreeNode): string =>
    node.kind === "array" ? asStrings(node).join(" ") : (asString(node) ?? "");

  for (const key of DEVCONTAINER_COMMANDS) {
    const entry = entryOf(root, key);
    if (!entry) continue;
    if (entry.value.kind === "object") {
      for (const named of entry.value.entries) {
        const text = toText(named.value);
        if (text) facts.push({ source: "devcontainer", text, event: key, offset: named.keyOffset });
      }
    } else {
      const text = toText(entry.value);
      if (text) facts.push({ source: "devcontainer", text, event: key, offset: entry.keyOffset });
    }
  }
  return facts;
}

function npmFacts(root: TreeNode): CommandFact[] {
  const scripts = get(root, "scripts");
  const facts: CommandFact[] = [];
  for (const key of NPM_LIFECYCLE) {
    const entry = entryOf(scripts, key);
    const text = asString(entry?.value);
    if (entry && text) facts.push({ source: "npm", text, event: key, offset: entry.keyOffset });
  }
  return facts;
}

export function extractCommands(kind: ConfigKind | undefined, root?: TreeNode): CommandFact[] {
  if (!kind || !root) return [];
  switch (kind) {
    case "claude-settings":
      return [...hookFacts(onlyHooks(root)), ...helperFacts(root)];
    case "gemini-settings":
      return hookFacts(onlyHooks(root));
    case "hooks":
      return hookFacts(root);
    case "antigravity-hooks":
      return antigravityHookFacts(root);
    case "vscode-tasks": {
      const tasks = get(root, "tasks");
      return tasks?.kind === "array" ? tasks.items.flatMap(taskCommandFacts) : [];
    }
    case "devcontainer":
      return devcontainerFacts(root);
    case "package":
      return npmFacts(root);
    default:
      return [];
  }
}

/** Settings files keep hooks under one key, so the rest of the file must not be read as events. */
function onlyHooks(root: TreeNode): TreeNode {
  return { kind: "object", offset: root.offset, entries: hooksEntry(root) };
}

function hooksEntry(root: TreeNode) {
  const entry = entryOf(root, "hooks");
  return entry ? [entry] : [];
}

function namedValues(node: TreeNode | undefined): McpValue[] {
  if (node?.kind !== "object") return [];
  return node.entries.flatMap((entry) => {
    const value = asString(entry.value);
    return value === undefined ? [] : [{ key: entry.key, value, offset: entry.keyOffset }];
  });
}

function toServer(name: string, node: TreeNode, offset: number): McpServer | null {
  if (node.kind !== "object") return null;
  const commandEntry = entryOf(node, "command");
  const argsEntry = entryOf(node, "args");
  const urlEntry = entryOf(node, "httpUrl") ?? entryOf(node, "url") ?? entryOf(node, "serverUrl");
  const command = asString(commandEntry?.value);
  const url = asString(urlEntry?.value);
  return {
    name,
    offset,
    ...(command !== undefined ? { command } : {}),
    commandOffset: commandEntry?.keyOffset ?? offset,
    args: asStrings(argsEntry?.value),
    argsOffset: argsEntry?.keyOffset ?? offset,
    env: namedValues(get(node, "env")),
    headers: namedValues(get(node, "headers")),
    ...(url !== undefined ? { url } : {}),
    urlOffset: urlEntry?.keyOffset ?? offset,
  };
}

export function extractMcpServers(
  kind: ConfigKind | undefined,
  root: TreeNode | undefined,
): McpServer[] {
  if (!root || (kind !== "mcp" && kind !== "gemini-settings")) return [];
  const container = get(root, "mcpServers") ?? get(root, "servers");
  if (!container) return [];

  if (container.kind === "array") {
    return container.items.flatMap((item, index) => {
      const server = toServer(
        asString(get(item, "name")) ?? `server-${index + 1}`,
        item,
        item.offset,
      );
      return server ? [server] : [];
    });
  }
  if (container.kind === "object") {
    return container.entries.flatMap((entry) => {
      const server = toServer(entry.key, entry.value, entry.keyOffset);
      return server ? [server] : [];
    });
  }
  return [];
}

export function mcpHelperFacts(root: TreeNode | undefined): CommandFact[] {
  const container = get(root, "mcpServers") ?? get(root, "servers");
  if (container?.kind !== "object") return [];
  return container.entries.flatMap(({ value }) => {
    const entry = entryOf(value, "headersHelper");
    const text = asString(entry?.value);
    return entry && text
      ? [
          {
            source: "helper" as const,
            text,
            event: "headersHelper",
            offset: entry.keyOffset,
          },
        ]
      : [];
  });
}
