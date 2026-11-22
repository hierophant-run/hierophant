import { findPackages, RULESET_VERSION, scan } from "@hierophant/engine";
import { checkPackages, summaryToRefs, type PackageSummary } from "@hierophant/intel";
import { ApiError } from "./errors";
import type { FetchLike, GitHubClient } from "./github-client";
import type { RepoTarget } from "./github-url";
import { errorName, logError } from "./log";
import { fetchSnapshot } from "./repo-snapshot";
import type { ReportStore, StoredReport } from "./report-store";
import { toReportView, type ReportView } from "./report-view";
import type { ScanBudget } from "./scan-budget";
import type { ProgressListener } from "./scan-progress";

/** Hides driver errors, which can include connection details, behind a generic code. */
export async function guardDatabase<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError("database_unavailable");
  }
}

const PACKAGE_REFRESH_MS = 24 * 60 * 60 * 1000;
const REQUESTS_PER_PACKAGE = 3;

const packageOptions = (packageFetch: FetchLike, budget?: ScanBudget) => ({
  fetch: packageFetch,
  ...(budget
    ? { maxPackages: Math.max(1, Math.floor((budget.remaining - 1) / REQUESTS_PER_PACKAGE)) }
    : {}),
});

const checkKey = (check: PackageSummary["checks"][number]) =>
  `${check.ecosystem}:${check.name}:${check.requested}`;

/** Advisories change after a commit is scanned, so stored package results are renewed daily. */
async function refreshPackages(
  report: StoredReport,
  store: ReportStore,
  packageFetch: FetchLike | undefined,
  onProgress?: ProgressListener,
  budget?: ScanBudget,
): Promise<StoredReport> {
  const current = report.packageChecks;
  if (!packageFetch || !current || current.checks.length === 0) return report;
  if (Date.now() - Date.parse(current.checkedAt) < PACKAGE_REFRESH_MS) return report;

  onProgress?.({ stage: "packages" });
  const fresh = await checkPackages(summaryToRefs(current), packageOptions(packageFetch, budget));
  if (fresh.checks.every((check) => check.verdict === "unavailable")) return report;

  // A lookup that failed this time keeps its last known result.
  const previous = new Map(current.checks.map((check) => [checkKey(check), check]));
  const merged: PackageSummary = {
    ...fresh,
    omitted: current.omitted,
    checks: fresh.checks.map((check) =>
      check.verdict === "unavailable" ? (previous.get(checkKey(check)) ?? check) : check,
    ),
  };
  try {
    await store.updatePackageChecks(report.id, merged);
  } catch (error) {
    logError("package_refresh_failed", { cause: errorName(error) });
  }
  return { ...report, packageChecks: merged };
}

export async function runScan(
  target: RepoTarget,
  github: GitHubClient,
  store: ReportStore,
  treeTimeoutMs?: number,
  onProgress?: ProgressListener,
  packageFetch?: FetchLike,
  budget?: ScanBudget,
): Promise<{ report: ReportView; cached: boolean }> {
  onProgress?.({ stage: "repository" });
  const repository = await github.repository(target.owner, target.repo);
  if (repository.isPrivate) throw new ApiError("repo_private");

  const { owner, name } = repository;
  const commitSha = await github.commitSha(owner, name, target.ref ?? repository.defaultBranch);

  const existing = await guardDatabase(() =>
    store.findByCommit(owner, name, commitSha, RULESET_VERSION),
  );
  if (existing) {
    const report = await refreshPackages(existing, store, packageFetch, onProgress, budget);
    return { report: toReportView(report), cached: true };
  }

  const { files, skipped } = await fetchSnapshot(
    github,
    owner,
    name,
    commitSha,
    treeTimeoutMs,
    onProgress,
    budget,
  );
  onProgress?.({ stage: "scanning" });
  const result = scan(files);

  const packages = findPackages(files);
  let packageChecks: PackageSummary | null = null;
  if (packageFetch && packages.length > 0) {
    onProgress?.({ stage: "packages" });
    packageChecks = await checkPackages(packages, packageOptions(packageFetch, budget));
  }

  onProgress?.({ stage: "saving" });

  const saved = await guardDatabase(() =>
    store.save({
      owner,
      repo: name,
      commitSha,
      rulesetVersion: result.rulesetVersion,
      status: result.status,
      filesScanned: result.filesScanned,
      impact: result.impact,
      skipped: [...skipped, ...result.skipped],
      findings: result.findings,
      packageChecks,
    }),
  );
  return { report: toReportView(saved, result.findings), cached: false };
}
