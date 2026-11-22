import {
  AGENTS,
  type AgentId,
  type Impact,
  type ScanResult,
  type ScanStatus,
} from "@hierophant/engine";

/** Below this sample size the numbers are too small to publish. */
export const MIN_PUBLISHABLE_SAMPLE = 30;
const MIN_CELL = 5;

/** Small counts could point to a specific repository, so they are never shown exactly. */
export type Cell = number | "<5";

export type ResearchOutcome =
  { kind: "scanned"; result: ScanResult } | { kind: "failed"; code: string };

export type AggregateStats = {
  rulesetVersion: string;
  sampleSize: number;
  scanned: number;
  failed: number;
  stoppedEarly: boolean;
  publishable: boolean;
  statuses: Record<ScanStatus, Cell>;
  reposWithAgentFiles: Cell;
  reposByRule: Record<string, Cell>;
  reposByAgentImpact: Record<AgentId, Record<Impact, Cell>>;
  failures: Record<string, Cell>;
};

const cell = (count: number): Cell => (count > 0 && count < MIN_CELL ? "<5" : count);

const bump = (counts: Map<string, number>, key: string) =>
  counts.set(key, (counts.get(key) ?? 0) + 1);

const toCells = (counts: Map<string, number>) =>
  Object.fromEntries(
    [...counts.entries()]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([key, count]) => [key, cell(count)]),
  );

const IMPACTS: Impact[] = [
  "runs_on_open",
  "runs_after_trust_prompt",
  "steers_agent",
  "behavior_unknown",
  "not_detected",
];

/** Builds totals only. The result holds no repository names, paths, or file content. */
export function aggregate(
  outcomes: readonly ResearchOutcome[],
  rulesetVersion: string,
  sampleSize: number,
  stoppedEarly: boolean,
): AggregateStats {
  const statuses = new Map<string, number>();
  const rules = new Map<string, number>();
  const failures = new Map<string, number>();
  const impacts = new Map<string, number>();
  let withAgentFiles = 0;
  let scanned = 0;

  for (const outcome of outcomes) {
    if (outcome.kind === "failed") {
      bump(failures, outcome.code);
      continue;
    }
    scanned += 1;
    const { result } = outcome;
    bump(statuses, result.status);
    if (result.filesScanned > 0) withAgentFiles += 1;
    for (const ruleId of new Set(result.findings.map((finding) => finding.ruleId))) {
      bump(rules, ruleId);
    }
    for (const entry of result.impact) bump(impacts, `${entry.agent}:${entry.impact}`);
  }

  const reposByAgentImpact = Object.fromEntries(
    AGENTS.map((agent) => [
      agent,
      Object.fromEntries(
        IMPACTS.map((impact) => [impact, cell(impacts.get(`${agent}:${impact}`) ?? 0)]),
      ),
    ]),
  ) as Record<AgentId, Record<Impact, Cell>>;

  return {
    rulesetVersion,
    sampleSize,
    scanned,
    failed: outcomes.length - scanned,
    stoppedEarly,
    publishable: scanned >= MIN_PUBLISHABLE_SAMPLE && !stoppedEarly,
    statuses: {
      dangerous: cell(statuses.get("dangerous") ?? 0),
      needs_review: cell(statuses.get("needs_review") ?? 0),
      no_issues_found: cell(statuses.get("no_issues_found") ?? 0),
    },
    reposWithAgentFiles: cell(withAgentFiles),
    reposByRule: toCells(rules),
    reposByAgentImpact,
    failures: toCells(failures),
  };
}
