import { isAgentFile, type ScanStatus } from "@hierophant/engine";
import type { CheckTarget } from "@/lib/check-target";
import { runCheck } from "./checks";
import { fetchRegistryRecord, registryFingerprint } from "./checks/mcp";
import { ApiError } from "./errors";
import { GitHubClient, type FetchLike } from "./github-client";
import { errorName, logError } from "./log";
import type { RepoTarget } from "./github-url";
import {
  diffAgentFiles,
  hasChanges,
  monitorKey,
  type Monitor,
  type MonitorStore,
} from "./monitor-store";
import { listEntries } from "./repo-snapshot";
import type { ReportStore } from "./report-store";
import { ScanBudget } from "./scan-budget";
import { guardDatabase, runScan } from "./scan-service";

/** Shorter than the 30 minute schedule, so every watched repository is due on each run. */
export const CHECK_INTERVAL_MS = 25 * 60 * 1000;
/** How often people are told checks run. Matches the schedule in wrangler.jsonc. */
export const CHECK_SCHEDULE_MINUTES = 30;
export const MAX_MONITORS = 5000;
const MAX_AGENT_FILES = 400;
const MAX_SCAN_ATTEMPTS = 3;
const TREE_TIMEOUT_MS = 8_000;
const RUN_TIMEOUT_MS = 25_000;
/** A rescan is started only when this many requests are left, so it is not cut short. */
const SCAN_REQUEST_FLOOR = 30;
const REQUESTS_PER_CHECK = 3;
const UNLIMITED_BATCH = 50;
/** Requests a full MCP or skill check may need after a change is found. */
const CHANGE_CHECK_FLOOR = 20;
const MAX_SKILL_FILES = 300;

export type MonitorDeps = {
  store: ReportStore;
  monitors: MonitorStore;
  fetch: FetchLike;
  githubToken?: string;
  subrequestLimit?: number;
};

export type RunSummary = { checked: number; changed: number; scanned: number; failed: number };

function client(fetchImpl: FetchLike, githubToken?: string, signal?: AbortSignal) {
  return new GitHubClient({
    fetch: fetchImpl,
    ...(signal ? { signal } : {}),
    ...(githubToken ? { token: githubToken } : {}),
  });
}

/** Lists agent files by git blob hash. File contents are never downloaded here. */
export async function readAgentFiles(
  github: GitHubClient,
  owner: string,
  repo: string,
  commitSha: string,
): Promise<Record<string, string>> {
  const { entries } = await listEntries(github, owner, repo, commitSha, TREE_TIMEOUT_MS);
  const files: Record<string, string> = {};
  for (const entry of entries) {
    if (entry.type !== "blob" || !isAgentFile(entry.path)) continue;
    if (Object.keys(files).length >= MAX_AGENT_FILES) break;
    files[entry.path] = entry.sha;
  }
  return files;
}

/** Starts watching the repository of an existing report. */
export async function watchRepository(
  reportId: string,
  deps: MonitorDeps,
): Promise<{ monitor: Monitor; created: boolean }> {
  const report = await guardDatabase(() => deps.store.findById(reportId));
  if (!report) throw new ApiError("report_not_found");

  const existing = await guardDatabase(() => deps.monitors.findByRepo(report.owner, report.repo));
  if (existing) return { monitor: existing, created: false };
  if ((await guardDatabase(() => deps.monitors.total())) >= MAX_MONITORS) {
    throw new ApiError("monitor_limit");
  }

  const github = client(deps.fetch, deps.githubToken, AbortSignal.timeout(RUN_TIMEOUT_MS));
  const repository = await github.repository(report.owner, report.repo);
  if (repository.isPrivate) throw new ApiError("repo_private");
  const commitSha = await github.commitSha(
    repository.owner,
    repository.name,
    repository.defaultBranch,
  );
  const agentFiles = await readAgentFiles(github, repository.owner, repository.name, commitSha);
  return guardDatabase(() =>
    deps.monitors.create({
      owner: repository.owner,
      repo: repository.name,
      branch: repository.defaultBranch,
      commitSha,
      agentFiles,
    }),
  );
}

const isGone = (error: unknown) =>
  error instanceof ApiError && (error.code === "repo_not_found" || error.code === "repo_private");
const isRateLimited = (error: unknown) =>
  error instanceof ApiError && error.code === "github_rate_limited";

/** Scans the oldest change that has no report yet. */
async function scanPending(
  deps: MonitorDeps,
  fetchImpl: FetchLike,
  github: GitHubClient,
  budget: ScanBudget | undefined,
  summary: RunSummary,
) {
  if (budget && budget.remaining < SCAN_REQUEST_FLOOR) return;
  const pending = await deps.monitors.nextPending(MAX_SCAN_ATTEMPTS);
  if (!pending) return;
  const { event, monitor } = pending;
  try {
    const { report } = await runScan(
      { owner: monitor.owner, repo: monitor.repo, ref: event.commitSha },
      github,
      deps.store,
      TREE_TIMEOUT_MS,
      undefined,
      fetchImpl,
      budget,
    );
    await deps.monitors.attachReport(event.id, report.id, report.status);
    summary.scanned += 1;
  } catch (error) {
    await deps.monitors.markAttempt(event.id);
    summary.failed += 1;
    logError("monitor_scan_failed", { cause: errorName(error) });
  }
}

/** Lists every file in a skill folder by git blob hash. Contents are never downloaded here. */
export async function readSkillFiles(
  github: GitHubClient,
  owner: string,
  repo: string,
  commitSha: string,
  path: string,
): Promise<Record<string, string>> {
  const tree = await github.tree(owner, repo, commitSha, true, TREE_TIMEOUT_MS);
  if (tree.truncated) throw new ApiError("repo_too_large");
  const prefix = path ? `${path}/` : "";
  const files: Record<string, string> = {};
  for (const entry of tree.entries) {
    if (entry.type !== "blob" || !entry.path.startsWith(prefix)) continue;
    if (Object.keys(files).length >= MAX_SKILL_FILES) break;
    files[entry.path.slice(prefix.length)] = entry.sha;
  }
  if (!("SKILL.md" in files)) throw new ApiError("check_not_found");
  return files;
}

/** Runs the normal check. A failed check leaves the result empty instead of failing the run. */
async function checkStatus(
  target: CheckTarget,
  fetchImpl: FetchLike,
  githubToken?: string,
): Promise<ScanStatus | null> {
  try {
    const result = await runCheck(target, {
      fetch: fetchImpl,
      ...(githubToken ? { githubToken } : {}),
    });
    return result.status;
  } catch (error) {
    logError("monitor_check_failed", { cause: errorName(error) });
    return null;
  }
}

const hasRoom = (budget: ScanBudget | undefined) =>
  !budget || budget.remaining >= CHANGE_CHECK_FLOOR;

async function checkMonitor(
  monitor: Monitor,
  deps: MonitorDeps,
  github: GitHubClient,
  fetchImpl: FetchLike,
  budget: ScanBudget | undefined,
  summary: RunSummary,
) {
  if (monitor.kind === "mcp") {
    if (!hasRoom(budget)) return;
    const { body } = await fetchRegistryRecord(monitor.target, fetchImpl);
    summary.checked += 1;
    const fingerprint = registryFingerprint(body);
    const diff = diffAgentFiles(monitor.agentFiles, fingerprint);
    if (!hasChanges(diff)) {
      await deps.monitors.touch(monitor.id);
      return;
    }
    const status = await checkStatus({ kind: "mcp", name: monitor.target }, fetchImpl);
    await deps.monitors.recordChange(
      monitor,
      fingerprint.Version || "unknown",
      fingerprint,
      diff,
      status,
    );
    summary.changed += 1;
    return;
  }

  const commitSha = await github.commitSha(monitor.owner, monitor.repo, monitor.branch);
  summary.checked += 1;
  if (commitSha === monitor.commitSha) {
    await deps.monitors.touch(monitor.id);
    return;
  }

  if (monitor.kind === "skill") {
    if (!hasRoom(budget)) return;
    const files = await readSkillFiles(
      github,
      monitor.owner,
      monitor.repo,
      commitSha,
      monitor.target,
    );
    const diff = diffAgentFiles(monitor.agentFiles, files);
    if (!hasChanges(diff)) {
      await deps.monitors.touch(monitor.id, { commitSha });
      return;
    }
    const status = await checkStatus(
      {
        kind: "skill",
        owner: monitor.owner,
        repo: monitor.repo,
        path: monitor.target,
        ref: commitSha,
      },
      fetchImpl,
      deps.githubToken,
    );
    await deps.monitors.recordChange(monitor, commitSha, files, diff, status);
    summary.changed += 1;
    return;
  }

  const agentFiles = await readAgentFiles(github, monitor.owner, monitor.repo, commitSha);
  const diff = diffAgentFiles(monitor.agentFiles, agentFiles);
  if (!hasChanges(diff)) {
    await deps.monitors.touch(monitor.id, { commitSha });
    return;
  }
  await deps.monitors.recordChange(monitor, commitSha, agentFiles, diff);
  summary.changed += 1;
}

/** One scheduled pass: finish one pending scan, then check the repositories that are due. */
export async function runMonitors(deps: MonitorDeps, now = new Date()): Promise<RunSummary> {
  const summary: RunSummary = { checked: 0, changed: 0, scanned: 0, failed: 0 };
  const budget = deps.subrequestLimit ? new ScanBudget(deps.subrequestLimit) : undefined;
  const fetchImpl = budget ? budget.wrap(deps.fetch) : deps.fetch;
  const github = client(fetchImpl, deps.githubToken, AbortSignal.timeout(RUN_TIMEOUT_MS));

  await guardDatabase(() => scanPending(deps, fetchImpl, github, budget, summary));

  const batch = budget ? Math.floor(budget.remaining / REQUESTS_PER_CHECK) : UNLIMITED_BATCH;
  if (batch < 1) return summary;
  const due = await guardDatabase(() =>
    deps.monitors.due(new Date(now.getTime() - CHECK_INTERVAL_MS), batch),
  );
  for (const monitor of due) {
    if (budget && budget.remaining < REQUESTS_PER_CHECK) break;
    try {
      await checkMonitor(monitor, deps, github, fetchImpl, budget, summary);
    } catch (error) {
      if (isRateLimited(error)) break;
      summary.failed += 1;
      if (isGone(error)) {
        await guardDatabase(() => deps.monitors.touch(monitor.id, { status: "unavailable" }));
      } else {
        // A failed check waits for the next interval instead of retrying straight away.
        await guardDatabase(() => deps.monitors.touch(monitor.id));
        logError("monitor_check_failed", { cause: errorName(error) });
      }
    }
  }
  return summary;
}

async function assertRoom(deps: MonitorDeps) {
  if ((await guardDatabase(() => deps.monitors.total())) >= MAX_MONITORS) {
    throw new ApiError("monitor_limit");
  }
}

/** Starts watching an MCP server or an agent skill from its check result. */
export async function watchCheck(
  target: Extract<CheckTarget, { kind: "mcp" | "skill" }>,
  deps: MonitorDeps,
): Promise<{ monitor: Monitor; created: boolean }> {
  if (target.kind === "mcp") {
    const existing = await guardDatabase(() =>
      deps.monitors.findByKey(monitorKey("mcp", "", "", target.name)),
    );
    if (existing) return { monitor: existing, created: false };
    await assertRoom(deps);
    const { body } = await fetchRegistryRecord(target.name, deps.fetch);
    const fingerprint = registryFingerprint(body);
    const lastStatus = await checkStatus(target, deps.fetch);
    return guardDatabase(() =>
      deps.monitors.create({
        kind: "mcp",
        owner: "",
        repo: target.name,
        target: target.name,
        branch: "",
        commitSha: fingerprint.Version || "unknown",
        agentFiles: fingerprint,
        lastStatus,
      }),
    );
  }

  const github = client(deps.fetch, deps.githubToken, AbortSignal.timeout(RUN_TIMEOUT_MS));
  const repository = await github.repository(target.owner, target.repo);
  if (repository.isPrivate) throw new ApiError("repo_private");
  const key = monitorKey("skill", repository.owner, repository.name, target.path);
  const existing = await guardDatabase(() => deps.monitors.findByKey(key));
  if (existing) return { monitor: existing, created: false };
  await assertRoom(deps);
  const branch = repository.defaultBranch;
  const commitSha = await github.commitSha(repository.owner, repository.name, branch);
  const files = await readSkillFiles(
    github,
    repository.owner,
    repository.name,
    commitSha,
    target.path,
  );
  const lastStatus = await checkStatus(
    {
      kind: "skill",
      owner: repository.owner,
      repo: repository.name,
      path: target.path,
      ref: commitSha,
    },
    deps.fetch,
    deps.githubToken,
  );
  return guardDatabase(() =>
    deps.monitors.create({
      kind: "skill",
      owner: repository.owner,
      repo: repository.name,
      target: target.path,
      branch,
      commitSha,
      agentFiles: files,
      lastStatus,
    }),
  );
}

/** Starts watching a repository from its URL, then scans its current commit for a baseline. */
export async function watchFromUrl(
  target: RepoTarget,
  deps: MonitorDeps,
  budget?: ScanBudget,
): Promise<{ monitor: Monitor; created: boolean }> {
  const github = client(deps.fetch, deps.githubToken, AbortSignal.timeout(RUN_TIMEOUT_MS));
  const repository = await github.repository(target.owner, target.repo);
  if (repository.isPrivate) throw new ApiError("repo_private");
  const existing = await guardDatabase(() =>
    deps.monitors.findByRepo(repository.owner, repository.name),
  );
  if (existing) return { monitor: existing, created: false };
  await assertRoom(deps);

  const commitSha = await github.commitSha(
    repository.owner,
    repository.name,
    repository.defaultBranch,
  );
  const agentFiles = await readAgentFiles(github, repository.owner, repository.name, commitSha);
  const result = await guardDatabase(() =>
    deps.monitors.create({
      owner: repository.owner,
      repo: repository.name,
      branch: repository.defaultBranch,
      commitSha,
      agentFiles,
    }),
  );
  try {
    await runScan(
      { owner: repository.owner, repo: repository.name, ref: commitSha },
      github,
      deps.store,
      TREE_TIMEOUT_MS,
      undefined,
      deps.fetch,
      budget,
    );
  } catch (error) {
    // The watch still works without a baseline report. The page offers a scan instead.
    logError("monitor_baseline_failed", { cause: errorName(error) });
  }
  return result;
}
