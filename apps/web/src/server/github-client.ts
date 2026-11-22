import { ApiError } from "./errors";
import { errorName, logError } from "./log";

const API_ORIGIN = "https://api.github.com";
const RAW_ORIGIN = "https://raw.githubusercontent.com";
const MAX_JSON_BYTES = 32 * 1024 * 1024;

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export type TreeEntry = {
  path: string;
  mode: string;
  type: string;
  sha: string;
  size?: number;
};

export type RepoInfo = {
  owner: string;
  name: string;
  isPrivate: boolean;
  defaultBranch: string;
};

async function readLimited(response: Response, maxBytes: number): Promise<Uint8Array | null> {
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (declared > maxBytes) {
    await response.body?.cancel();
    return null;
  }
  if (!response.body) return new Uint8Array();

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

function retryAfter(response: Response): number | undefined {
  const header = Number(response.headers.get("retry-after"));
  if (Number.isFinite(header) && header > 0) return Math.ceil(header);
  const reset = Number(response.headers.get("x-ratelimit-reset"));
  if (!Number.isFinite(reset) || reset <= 0) return undefined;
  return Math.max(1, Math.ceil(reset - Date.now() / 1000));
}

function errorFor(response: Response): ApiError {
  const { status } = response;
  const limited =
    status === 429 ||
    (status === 403 &&
      (response.headers.get("x-ratelimit-remaining") === "0" ||
        response.headers.has("retry-after")));
  if (limited) return new ApiError("github_rate_limited", retryAfter(response));
  if (status === 409) return new ApiError("repo_empty");
  if ([403, 404, 410, 451].includes(status)) return new ApiError("repo_not_found");
  return new ApiError("github_unavailable");
}

const encodeSegments = (path: string) => path.split("/").map(encodeURIComponent).join("/");

export class GitHubClient {
  constructor(
    private readonly options: { token?: string; fetch: FetchLike; signal?: AbortSignal },
  ) {}

  /** True once the time budget for the whole scan has run out. */
  get aborted(): boolean {
    return this.options.signal?.aborted === true;
  }

  private async send(
    url: string,
    init: RequestInit,
    signal: AbortSignal | undefined = this.options.signal,
  ): Promise<Response> {
    try {
      return await this.options.fetch(url, { ...init, signal });
    } catch (error) {
      if (signal?.aborted) throw new ApiError("scan_timeout");
      if (error instanceof ApiError) throw error;
      // The URL and message are not logged. This flag marks a limit of the hosting platform.
      logError("github_fetch_failed", {
        cause: errorName(error),
        subrequestLimit: error instanceof Error && /subrequest/i.test(error.message),
      });
      throw new ApiError("github_unavailable");
    }
  }

  private async api(
    path: string,
    accept: string,
    redirects = 0,
    signal: AbortSignal | undefined = this.options.signal,
  ): Promise<Response> {
    const { token } = this.options;
    const response = await this.send(
      `${API_ORIGIN}${path}`,
      {
        redirect: "manual",
        headers: {
          Accept: accept,
          "User-Agent": "hierophant-scanner",
          "X-GitHub-Api-Version": "2022-11-28",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      },
      signal,
    );

    if ([301, 302, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location || redirects >= 2) throw new ApiError("repo_not_found");
      const next = new URL(location, API_ORIGIN);
      // The token must never follow a redirect to another host.
      if (next.origin !== API_ORIGIN) throw new ApiError("github_unavailable");
      return this.api(`${next.pathname}${next.search}`, accept, redirects + 1, signal);
    }
    if (!response.ok) throw errorFor(response);
    return response;
  }

  private async json<T>(
    path: string,
    signal: AbortSignal | undefined = this.options.signal,
  ): Promise<T> {
    const response = await this.api(path, "application/vnd.github+json", 0, signal);
    let bytes: Uint8Array | null;
    try {
      bytes = await readLimited(response, MAX_JSON_BYTES);
    } catch {
      if (signal?.aborted) throw new ApiError("scan_timeout");
      throw new ApiError("github_unavailable");
    }
    if (!bytes) throw new ApiError("repo_too_large");
    try {
      return JSON.parse(new TextDecoder().decode(bytes)) as T;
    } catch {
      throw new ApiError("github_unavailable");
    }
  }

  async repository(owner: string, repo: string): Promise<RepoInfo> {
    const data = await this.json<{
      name?: unknown;
      owner?: { login?: unknown };
      private?: unknown;
      default_branch?: unknown;
    }>(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`);

    if (
      typeof data.name !== "string" ||
      typeof data.owner?.login !== "string" ||
      typeof data.default_branch !== "string"
    ) {
      throw new ApiError("github_unavailable");
    }
    return {
      owner: data.owner.login,
      name: data.name,
      isPrivate: data.private !== false,
      defaultBranch: data.default_branch,
    };
  }

  async commitSha(owner: string, repo: string, ref: string): Promise<string> {
    const response = await this.api(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits/${encodeURIComponent(ref)}`,
      "application/vnd.github.sha",
    );
    const sha = (await response.text()).trim();
    if (!/^[0-9a-f]{40}$/.test(sha)) throw new ApiError("github_unavailable");
    return sha;
  }

  async tree(
    owner: string,
    repo: string,
    sha: string,
    recursive: boolean,
    timeoutMs?: number,
  ): Promise<{ entries: TreeEntry[]; truncated: boolean }> {
    const query = recursive ? "?recursive=1" : "";
    const { signal: scanSignal } = this.options;
    const signal =
      timeoutMs === undefined
        ? scanSignal
        : AbortSignal.any([AbortSignal.timeout(timeoutMs), ...(scanSignal ? [scanSignal] : [])]);
    const data = await this.json<{ tree?: unknown; truncated?: unknown }>(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/${sha}${query}`,
      signal,
    );
    if (!Array.isArray(data.tree)) throw new ApiError("github_unavailable");

    const entries = data.tree.flatMap((item: Partial<TreeEntry>): TreeEntry[] => {
      if (
        typeof item?.path !== "string" ||
        typeof item.mode !== "string" ||
        typeof item.type !== "string" ||
        typeof item.sha !== "string"
      ) {
        return [];
      }
      return [
        {
          path: item.path,
          mode: item.mode,
          type: item.type,
          sha: item.sha,
          ...(typeof item.size === "number" ? { size: item.size } : {}),
        },
      ];
    });
    return { entries, truncated: data.truncated === true };
  }

  /** Downloads one file at a pinned commit. The token is never sent to this host. */
  async rawFile(
    owner: string,
    repo: string,
    sha: string,
    path: string,
    maxBytes: number,
  ): Promise<string | null> {
    const url = `${RAW_ORIGIN}/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${sha}/${encodeSegments(path)}`;
    const response = await this.send(url, {
      // Workers reject redirect: "error". A redirect response is simply not read.
      redirect: "manual",
      headers: { "User-Agent": "hierophant-scanner" },
    });
    if (response.status === 404) return null;
    if (response.status === 429) throw new ApiError("github_rate_limited", retryAfter(response));
    if (!response.ok) return null;

    try {
      const bytes = await readLimited(response, maxBytes);
      return bytes ? new TextDecoder().decode(bytes) : null;
    } catch {
      if (this.options.signal?.aborted) throw new ApiError("scan_timeout");
      return null;
    }
  }
}
