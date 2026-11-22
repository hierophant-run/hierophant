import { MAX_FILE_CHARS, scan } from "@hierophant/engine";
import type { CheckTarget } from "@/lib/check-target";
import { ApiError } from "../errors";
import { GitHubClient, type TreeEntry } from "../github-client";
import { filePermalink } from "../report-view";
import {
  buildResult,
  cleanText,
  findingSignal,
  type CheckContext,
  type CheckResult,
  type CheckSignal,
} from "./common";

const TIMEOUT_MS = 15_000;
const MAX_FILES = 25;
const SYMLINK_MODE = "120000";
const VIRTUAL_ROOT = ".claude/skills/skill/";
const READABLE =
  /\.(?:md|mdc|markdown|txt|sh|bash|zsh|js|mjs|cjs|ts|py|ps1|rb|pl|bat|cmd|json|jsonc|ya?ml|toml)$/i;
const SCRIPT = /\.(?:sh|bash|zsh|js|mjs|cjs|ts|py|ps1|rb|pl|bat|cmd)$/i;

const priority = (relative: string) =>
  relative === "SKILL.md" ? 0 : SCRIPT.test(relative) ? 1 : relative.endsWith(".md") ? 2 : 3;

/** Reports an `allowed-tools` value that lets the skill run any command without asking. */
function broadToolSignal(skill: string): CheckSignal | null {
  const frontmatter = /^---\r?\n([\s\S]{0,4000}?)\r?\n---/.exec(skill)?.[1];
  const value = frontmatter?.match(/^allowed-tools:\s*(.+)$/m)?.[1];
  if (!value) return null;
  const tools = value
    .replace(/[[\]"',]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (!tools.some((tool) => tool === "*" || tool === "Bash" || tool === "Bash(*)")) return null;
  return {
    severity: "high",
    title: "Skill pre-approves running any command",
    detail:
      "Its allowed-tools setting lets the agent run shell commands without asking. Remove it or limit it to specific commands.",
    location: "SKILL.md",
  };
}

export async function runSkillCheck(
  target: Extract<CheckTarget, { kind: "skill" }>,
  context: CheckContext,
): Promise<CheckResult> {
  const github = new GitHubClient({
    fetch: context.fetch,
    signal: AbortSignal.timeout(TIMEOUT_MS),
    ...(context.githubToken ? { token: context.githubToken } : {}),
  });
  const repository = await github.repository(target.owner, target.repo);
  if (repository.isPrivate) throw new ApiError("repo_private");
  const { owner, name } = repository;
  const sha = await github.commitSha(owner, name, target.ref ?? repository.defaultBranch);
  const tree = await github.tree(owner, name, sha, true);

  const prefix = target.path ? `${target.path}/` : "";
  const inSkill = tree.entries.filter(
    (entry: TreeEntry) => entry.type === "blob" && entry.path.startsWith(prefix),
  );
  const relative = (entry: TreeEntry) => entry.path.slice(prefix.length);
  if (!inSkill.some((entry) => relative(entry) === "SKILL.md" && entry.mode !== SYMLINK_MODE)) {
    throw new ApiError("check_not_found");
  }

  const links = inSkill.filter((entry) => entry.mode === SYMLINK_MODE);
  const candidates = inSkill
    .filter(
      (entry) =>
        entry.mode !== SYMLINK_MODE &&
        READABLE.test(entry.path) &&
        (entry.size ?? 0) <= MAX_FILE_CHARS,
    )
    .sort((a, b) => priority(relative(a)) - priority(relative(b)) || (a.path < b.path ? -1 : 1));
  const selected = candidates.slice(0, MAX_FILES);
  const unread = inSkill.length - links.length - selected.length;

  const files = await Promise.all(
    selected.map(async (entry) => ({
      entry,
      content: await github.rawFile(owner, name, sha, entry.path, MAX_FILE_CHARS),
    })),
  );
  const loaded = files.flatMap(({ entry, content }) =>
    content === null ? [] : [{ path: `${VIRTUAL_ROOT}${relative(entry)}`, content }],
  );
  const skill = loaded.find((file) => file.path === `${VIRTUAL_ROOT}SKILL.md`);
  if (!skill) throw new ApiError("check_unavailable");

  const repoUrl = `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;
  const signals: CheckSignal[] = scan(loaded).findings.map((finding) => {
    const file = finding.path.slice(VIRTUAL_ROOT.length);
    return findingSignal(
      finding,
      `${cleanText(file)}:${finding.line}`,
      filePermalink(repoUrl, sha, `${prefix}${file}`, finding.line),
    );
  });

  const broadTools = broadToolSignal(skill.content);
  if (broadTools) signals.push(broadTools);
  const scripts = loaded.filter((file) => SCRIPT.test(file.path)).length;
  if (scripts > 0) {
    signals.push({
      severity: "info",
      title: `Includes ${scripts} ${scripts === 1 ? "script" : "scripts"} the agent can run`,
      detail: "Read them before you install this skill.",
    });
  }

  const notChecked = ["What the scripts do when they run", "Packages the scripts install"];
  if (unread > 0) notChecked.unshift(`${unread} other files in this skill`);
  if (links.length > 0) notChecked.unshift(`${links.length} symbolic links`);

  const skillPath = target.path || "repository root";
  const encodedPath = target.path.split("/").map(encodeURIComponent).join("/");
  return buildResult({
    target,
    kindLabel: "Agent skill",
    name: cleanText(target.path.split("/").at(-1) || name),
    subtitle: `${cleanText(`${owner}/${name}`)} \u00B7 ${cleanText(skillPath)} \u00B7 ${sha.slice(0, 7)}`,
    sourceUrl: `${repoUrl}/tree/${sha}/${encodedPath}`,
    signals,
    checked: [
      `${loaded.length} ${loaded.length === 1 ? "file" : "files"} at commit ${sha.slice(0, 7)}`,
      "Hidden instructions, remote code, and concealed payloads",
      "Pre-approved tools in SKILL.md",
    ],
    notChecked,
  });
}
