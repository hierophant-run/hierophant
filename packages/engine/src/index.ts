export { RULES, RULESET_VERSION } from "./catalog.js";
export type { RuleDefinition, RuleId } from "./catalog.js";
export { MAX_FILE_CHARS, MAX_FILES, MAX_TOTAL_CHARS } from "./limits.js";
export { AGENT_BEHAVIOR, AGENTS, BEHAVIOR_CHECKED_ON } from "./impact.js";
export type {
  AgentBehavior,
  AgentId,
  AgentImpact,
  Impact,
  ImpactFinding,
  Surface,
} from "./impact.js";
export { parsePackageSpec } from "./packages.js";
export type { PackageEcosystem, PackageRef } from "./packages.js";
export { findPackages, findReferencedScripts, scan } from "./scan.js";
export { agentFileRank, isAgentFile } from "./targets.js";
export type { Finding, RepoFile, ScanResult, ScanStatus, Severity, SkippedFile } from "./types.js";

/** Version of the scanner engine package. */
export const ENGINE_VERSION = "0.3.0";
