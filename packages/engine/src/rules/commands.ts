import type { CommandFact, TaskRun } from "../facts.js";
import {
  decodesAndExecutes,
  downloadsAndExecutes,
  hostOf,
  isLocalHost,
  isSuspiciousCommand,
  referencedScriptPaths,
} from "../shell.js";
import { looksObfuscated } from "../text.js";
import type { Reporter } from "./reporter.js";

function isRemoteHook(fact: CommandFact): boolean {
  if (!fact.url) return false;
  const host = hostOf(fact.url);
  return host === undefined || !isLocalHost(host);
}

export function runCommandRules(
  commands: readonly CommandFact[],
  folderOpen: readonly TaskRun[],
  scripts: ReadonlyMap<string, string>,
  report: Reporter,
): void {
  for (const run of folderOpen) report("AUTO-003", run.offset);

  for (const fact of commands) {
    const { source, text, offset } = fact;

    if (source === "hook") {
      if (fact.autoStart) report("AUTO-001", offset);
      if (isRemoteHook(fact) || (!fact.url && isSuspiciousCommand(text))) {
        report("AUTO-002", offset);
      }
    }
    const raised = isSuspiciousCommand(text) ? ({ severity: "high" } as const) : undefined;
    if (source === "helper") report("AUTO-007", offset, raised);
    if (source === "npm" && isSuspiciousCommand(text)) report("AUTO-005", offset);
    if (source === "devcontainer") {
      if (fact.event === "initializeCommand") report("AUTO-006", offset, raised);
      if (downloadsAndExecutes(text)) report("AUTO-004", offset);
    }

    if (fact.url) continue;
    if (downloadsAndExecutes(text)) report("EXEC-001", offset);
    if (decodesAndExecutes(text)) report("EXEC-002", offset);

    const packed = referencedScriptPaths(text).some((path) => {
      const content = scripts.get(path);
      return content !== undefined && looksObfuscated(content);
    });
    if (packed) report("EXEC-003", offset);
  }
}
