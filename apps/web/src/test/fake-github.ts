import type { FetchLike } from "@/server/github-client";

export type FakeFile = {
  path: string;
  content?: string;
  mode?: string;
  type?: string;
  size?: number;
};

export type FakeRepo = {
  owner: string;
  name: string;
  isPrivate?: boolean;
  defaultBranch?: string;
  sha?: string;
  files: FakeFile[];
  truncated?: boolean;
  empty?: boolean;
};

export type FakeCall = { url: string; authorization: string | null };

export const DEFAULT_SHA = "a".repeat(40);

const json = (value: unknown, status = 200, headers: HeadersInit = {}) =>
  new Response(JSON.stringify(value), { status, headers });

function treeEntry(file: FakeFile, path = file.path) {
  return {
    path,
    mode: file.mode ?? "100644",
    type: file.type ?? "blob",
    sha: "b".repeat(40),
    size: file.size ?? new TextEncoder().encode(file.content ?? "").length,
  };
}

function treeResponse(repo: FakeRepo, sha: string, recursive: boolean): Response {
  const commit = repo.sha ?? DEFAULT_SHA;

  if (sha.startsWith("dir-")) {
    const directory = decodeURIComponent(sha.slice("dir-".length));
    const prefix = `${directory}/`;
    return json({
      tree: repo.files
        .filter((file) => file.path.startsWith(prefix))
        .map((file) => treeEntry(file, file.path.slice(prefix.length))),
      truncated: false,
    });
  }
  if (sha !== commit) return json({ message: "Not Found" }, 404);

  if (recursive) {
    return json({
      tree: repo.truncated ? [] : repo.files.map((file) => treeEntry(file)),
      truncated: repo.truncated === true,
    });
  }

  const rootFiles = repo.files.filter((file) => !file.path.includes("/"));
  const directories = [
    ...new Set(
      repo.files.filter((file) => file.path.includes("/")).map((f) => f.path.split("/")[0]!),
    ),
  ];
  return json({
    tree: [
      ...rootFiles.map((file) => treeEntry(file)),
      ...directories.map((path) => ({
        path,
        mode: "040000",
        type: "tree",
        sha: `dir-${encodeURIComponent(path)}`,
      })),
    ],
    truncated: false,
  });
}

/** An in-memory GitHub that records every request. */
export function fakeGitHub(repos: FakeRepo[]) {
  const calls: FakeCall[] = [];
  const find = (owner: string, name: string) =>
    repos.find(
      (repo) =>
        repo.owner.toLowerCase() === owner.toLowerCase() &&
        repo.name.toLowerCase() === name.toLowerCase(),
    );

  const fetchImpl: FetchLike = async (input, init) => {
    const headers = new Headers(init.headers);
    calls.push({ url: input, authorization: headers.get("authorization") });
    const url = new URL(input);

    if (url.hostname === "raw.githubusercontent.com") {
      const [owner = "", name = "", , ...parts] = url.pathname.slice(1).split("/");
      const path = parts.map(decodeURIComponent).join("/");
      const file = find(owner, name)?.files.find((candidate) => candidate.path === path);
      return file?.content === undefined
        ? new Response("Not Found", { status: 404 })
        : new Response(file.content);
    }
    if (url.hostname !== "api.github.com") throw new Error(`Unexpected host: ${url.hostname}`);

    const [, owner = "", name = "", section, kind, ...rest] = url.pathname.slice(1).split("/");
    const repo = find(owner, name);
    if (!repo) return json({ message: "Not Found" }, 404);

    if (section === undefined) {
      return json({
        name: repo.name,
        owner: { login: repo.owner },
        private: repo.isPrivate === true,
        default_branch: repo.defaultBranch ?? "main",
      });
    }
    if (section === "commits") {
      if (repo.empty) return json({ message: "Git Repository is empty." }, 409);
      if (decodeURIComponent(kind ?? "") !== (repo.defaultBranch ?? "main")) {
        return json({ message: "No commit found" }, 404);
      }
      return new Response(repo.sha ?? DEFAULT_SHA);
    }
    if (section === "git" && kind === "trees") {
      return treeResponse(repo, rest.join("/"), url.searchParams.get("recursive") === "1");
    }
    return json({ message: "Not Found" }, 404);
  };

  return { fetch: fetchImpl, calls };
}
