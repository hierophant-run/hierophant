import { RULESET_VERSION, scan, type Severity } from "@hierophant/engine";
import { ApiError } from "../server/errors";
import { GitHubClient, type FetchLike } from "../server/github-client";
import { parseGitHubUrl, type RepoTarget } from "../server/github-url";
import { fetchSnapshot } from "../server/repo-snapshot";
import { aggregate, type AggregateStats, type ResearchOutcome } from "./aggregate";

export const MAX_SAMPLE = 1000;
const REPO_TIMEOUT_MS = 30_000;
const SERIOUS: ReadonlySet<Severity> = new Set(["critical", "high"]);

/** Kept private. It exists only so that owners can be told directly. */
export type PrivateDisclosure = {
  repository: string;
  commitSha: string;
  findings: Array<{ ruleId: string; severity: Severity; path: string; line: number }>;
};

export function parseRepoList(text: string): RepoTarget[] {
  const targets = new Map<string, RepoTarget>();
  text.split(/\r?\n/).forEach((raw, index) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    if (!/^[\w.-]+\/[\w.-]+$/.test(line)) {
      throw new Error(`Line ${index + 1} must look like owner/repo.`);
    }
    const target = parseGitHubUrl(`https://github.com/${line}`);
    targets.set(`${target.owner}/${target.repo}`.toLowerCase(), target);
  });
  if (targets.size > MAX_SAMPLE) throw new Error(`The sample is limited to ${MAX_SAMPLE} repos.`);
  return [...targets.values()];
}

async function scanRepo(target: RepoTarget, fetchImpl: FetchLike, token?: string) {
  const github = new GitHubClient({
    fetch: fetchImpl,
    signal: AbortSignal.timeout(REPO_TIMEOUT_MS),
    ...(token ? { token } : {}),
  });
  const repository = await github.repository(target.owner, target.repo);
  if (repository.isPrivate) throw new ApiError("repo_private");
  const { owner, name } = repository;
  const commitSha = await github.commitSha(owner, name, repository.defaultBranch);
  const { files } = await fetchSnapshot(github, owner, name, commitSha);
  return { repository: `${owner}/${name}`, commitSha, result: scan(files) };
}

/** Scans one repo at a time and stops at the first GitHub rate limit. Nothing is stored. */
export async function runResearch(options: {
  repos: readonly RepoTarget[];
  fetch: FetchLike;
  token?: string;
  onProgress?: (done: number, total: number) => void;
}): Promise<{ stats: AggregateStats; disclosures: PrivateDisclosure[] }> {
  const { repos, fetch: fetchImpl, token, onProgress } = options;
  const outcomes: ResearchOutcome[] = [];
  const disclosures: PrivateDisclosure[] = [];
  let stoppedEarly = false;

  for (const target of repos) {
    try {
      const { repository, commitSha, result } = await scanRepo(target, fetchImpl, token);
      outcomes.push({ kind: "scanned", result });
      const serious = result.findings.filter((finding) => SERIOUS.has(finding.severity));
      if (serious.length > 0) {
        disclosures.push({
          repository,
          commitSha,
          findings: serious.map(({ ruleId, severity, path, line }) => ({
            ruleId,
            severity,
            path,
            line,
          })),
        });
      }
    } catch (error) {
      if (error instanceof ApiError && error.code === "github_rate_limited") {
        stoppedEarly = true;
        break;
      }
      outcomes.push({
        kind: "failed",
        code: error instanceof ApiError ? error.code : "internal_error",
      });
    }
    onProgress?.(outcomes.length, repos.length);
  }

  return {
    stats: aggregate(outcomes, RULESET_VERSION, repos.length, stoppedEarly),
    disclosures,
  };
}
