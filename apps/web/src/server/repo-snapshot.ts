import {
  agentFileRank,
  findReferencedScripts,
  isAgentFile,
  MAX_FILE_CHARS,
  MAX_FILES,
  MAX_TOTAL_CHARS,
  type RepoFile,
  type SkippedFile,
} from "@hierophant/engine";
import { ApiError } from "./errors";
import type { GitHubClient, TreeEntry } from "./github-client";
import type { ScanBudget } from "./scan-budget";
import type { ProgressListener } from "./scan-progress";

const DOWNLOAD_CONCURRENCY = 8;
const FULL_TREE_TIMEOUT_MS = 8_000;
const SYMLINK_MODE = "120000";
const SUBMODULE_MODE = "160000";
/** Requests kept back for package lookups and for scripts that hooks launch. */
const PACKAGE_REQUEST_RESERVE = 9;
const SCRIPT_REQUEST_RESERVE = 4;
const BUDGET_REASON = "Hosting request limit reached";
const AGENT_ROOT_DIRECTORIES = new Set([
  ".agent",
  ".agents",
  ".claude",
  ".cline",
  ".clinerules",
  ".continue",
  ".cursor",
  ".devcontainer",
  ".devin",
  ".gemini",
  ".github",
  ".vscode",
  ".windsurf",
]);

const UNSAFE_NAME = /[\u0000-\u001f\u007f]/;

const displayPath = (path: string) => path.replace(/[\u0000-\u001f\u007f]/g, "?");

export type Listing = { entries: TreeEntry[]; partial: boolean };

export async function listEntries(
  client: GitHubClient,
  owner: string,
  repo: string,
  sha: string,
  treeTimeoutMs: number,
): Promise<Listing> {
  let full: Awaited<ReturnType<GitHubClient["tree"]>> | null = null;
  try {
    full = await client.tree(owner, repo, sha, true, treeTimeoutMs);
  } catch (error) {
    const isSlowOrHuge =
      error instanceof ApiError &&
      (error.code === "repo_too_large" || error.code === "scan_timeout") &&
      !client.aborted;
    if (!isSlowOrHuge) throw error;
  }
  if (full && !full.truncated) return { entries: full.entries, partial: false };

  // The full listing was cut short or too slow, so read the root and agent folders directly.
  const root = await client.tree(owner, repo, sha, false);
  if (root.truncated) throw new ApiError("repo_too_large");

  const entries = root.entries.filter((entry) => entry.type !== "tree");
  const directories = root.entries.filter(
    (entry) => entry.type === "tree" && AGENT_ROOT_DIRECTORIES.has(entry.path),
  );
  for (const directory of directories) {
    const subtree = await client.tree(owner, repo, directory.sha, true);
    entries.push(
      ...subtree.entries.map((entry) => ({
        ...entry,
        path: `${directory.path}/${entry.path}`,
      })),
    );
  }
  return { entries, partial: true };
}

function compareByDepth(a: TreeEntry, b: TreeEntry): number {
  const depth = a.path.split("/").length - b.path.split("/").length;
  if (depth !== 0) return depth;
  return a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
}

function selectEntries(entries: readonly TreeEntry[], skipped: SkippedFile[]): TreeEntry[] {
  const selected: TreeEntry[] = [];
  let totalSize = 0;

  for (const entry of [...entries].sort(compareByDepth)) {
    if (entry.type === "tree" || !isAgentFile(entry.path)) continue;

    if (UNSAFE_NAME.test(entry.path)) {
      skipped.push({ path: displayPath(entry.path), reason: "Unsafe file name" });
    } else if (entry.mode === SYMLINK_MODE) {
      skipped.push({ path: entry.path, reason: "Symbolic link" });
    } else if (entry.mode === SUBMODULE_MODE || entry.type === "commit") {
      skipped.push({ path: entry.path, reason: "Git submodule" });
    } else if (entry.type !== "blob") {
      continue;
    } else if ((entry.size ?? 0) > MAX_FILE_CHARS) {
      skipped.push({ path: entry.path, reason: "File is too large to scan" });
    } else if (selected.length >= MAX_FILES) {
      skipped.push({ path: entry.path, reason: "File limit reached" });
    } else if (totalSize + (entry.size ?? 0) > MAX_TOTAL_CHARS) {
      skipped.push({ path: entry.path, reason: "Total size limit reached" });
    } else {
      totalSize += entry.size ?? 0;
      selected.push(entry);
    }
  }
  return selected;
}

/** Reads hooks and configs first, so a limited scan still covers what can run on its own. */
function limitToBudget(
  selected: TreeEntry[],
  budget: ScanBudget | undefined,
  skipped: SkippedFile[],
): TreeEntry[] {
  if (!budget) return selected;
  const allowed = Math.max(0, budget.remaining - PACKAGE_REQUEST_RESERVE - SCRIPT_REQUEST_RESERVE);
  if (selected.length <= allowed) return selected;

  const ranked = [...selected].sort(
    (a, b) => agentFileRank(a.path) - agentFileRank(b.path) || compareByDepth(a, b),
  );
  skipped.push({
    path: ".",
    reason: `Only ${allowed} of ${selected.length} agent files were checked because of a hosting limit`,
  });
  for (const entry of ranked.slice(allowed)) {
    skipped.push({ path: entry.path, reason: BUDGET_REASON });
  }
  return ranked.slice(0, allowed);
}

async function downloadAll(
  client: GitHubClient,
  owner: string,
  repo: string,
  sha: string,
  paths: readonly string[],
  skipped: SkippedFile[],
  onFileDone?: () => void,
): Promise<RepoFile[]> {
  const files: RepoFile[] = [];
  let next = 0;

  const worker = async () => {
    while (next < paths.length) {
      const path = paths[next++]!;
      const content = await client.rawFile(owner, repo, sha, path, MAX_FILE_CHARS);
      if (content === null) skipped.push({ path, reason: "Could not download this file" });
      else files.push({ path, content });
      onFileDone?.();
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(DOWNLOAD_CONCURRENCY, paths.length) }, () => worker()),
  );
  return files;
}

/** Loads only agent files and the scripts they launch. Nothing is cloned or executed. */
export async function fetchSnapshot(
  client: GitHubClient,
  owner: string,
  repo: string,
  sha: string,
  treeTimeoutMs: number = FULL_TREE_TIMEOUT_MS,
  onProgress?: ProgressListener,
  budget?: ScanBudget,
): Promise<{ files: RepoFile[]; skipped: SkippedFile[] }> {
  onProgress?.({ stage: "listing" });
  const { entries, partial } = await listEntries(client, owner, repo, sha, treeTimeoutMs);
  const skipped: SkippedFile[] = [];
  if (partial) {
    skipped.push({
      path: ".",
      reason:
        "The full file list was too large or slow, so only the root and agent folders were checked",
    });
  }

  const selected = limitToBudget(selectEntries(entries, skipped), budget, skipped);
  let done = 0;
  let total = selected.length;
  const onFileDone = () => {
    done += 1;
    onProgress?.({ stage: "downloading", done, total });
  };
  onProgress?.({ stage: "downloading", done, total });

  const files = await downloadAll(
    client,
    owner,
    repo,
    sha,
    selected.map((entry) => entry.path),
    skipped,
    onFileDone,
  );

  const byPath = new Map(entries.map((entry) => [entry.path, entry]));
  const loaded = new Set(files.map((file) => file.path));
  const scripts: string[] = [];
  for (const path of findReferencedScripts(files)) {
    if (loaded.has(path) || skipped.some((entry) => entry.path === path)) continue;
    const entry = byPath.get(path);
    if (!entry && !partial) continue;

    if (entry && (entry.type !== "blob" || entry.mode === SYMLINK_MODE)) {
      skipped.push({ path, reason: "Referenced script is not a regular file" });
    } else if ((entry?.size ?? 0) > MAX_FILE_CHARS) {
      skipped.push({ path, reason: "Referenced script is too large to inspect" });
    } else {
      scripts.push(path);
    }
  }

  const scriptRoom = budget
    ? Math.max(0, budget.remaining - PACKAGE_REQUEST_RESERVE)
    : scripts.length;
  for (const path of scripts.slice(scriptRoom)) skipped.push({ path, reason: BUDGET_REASON });
  const allowedScripts = scripts.slice(0, scriptRoom);

  const scriptSkips: SkippedFile[] = [];
  total += allowedScripts.length;
  const scriptFiles = await downloadAll(
    client,
    owner,
    repo,
    sha,
    allowedScripts,
    scriptSkips,
    onFileDone,
  );
  // In a partial listing a referenced path may simply not exist, which is not worth reporting.
  if (!partial) skipped.push(...scriptSkips);

  return { files: [...files, ...scriptFiles], skipped };
}
