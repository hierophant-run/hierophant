import { ApiError } from "./errors";

export type RepoTarget = { owner: string; repo: string; ref?: string };

const MAX_URL_LENGTH = 300;
const PREFIX = "https://github.com/";
const OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;
const REPO = /^[A-Za-z0-9._-]{1,100}$/;
const REF = /^[A-Za-z0-9._/-]{1,200}$/;
// Percent signs, backslashes, and non-ASCII characters are how parsers get tricked about a host.
const UNSAFE_CHARACTERS = /[^\x21-\x7e]|[\\%]/;

function invalid(): never {
  throw new ApiError("invalid_url");
}

/**
 * Accepts only https://github.com/{owner}/{repo}, optionally with /tree/{ref} or /commit/{sha}.
 * Callers build API URLs from the returned parts and never fetch the input itself.
 */
export function parseGitHubUrl(input: unknown): RepoTarget {
  if (typeof input !== "string") invalid();
  const raw = input.trim();
  if (!raw || raw.length > MAX_URL_LENGTH || UNSAFE_CHARACTERS.test(raw)) invalid();
  if (raw.slice(0, PREFIX.length).toLowerCase() !== PREFIX) invalid();

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    invalid();
  }
  if (
    url.protocol !== "https:" ||
    url.hostname !== "github.com" ||
    url.port !== "" ||
    url.username !== "" ||
    url.password !== ""
  ) {
    invalid();
  }

  // Read the path as typed, because URL parsing would silently resolve "..".
  const typedPath = raw.slice(PREFIX.length).split(/[?#]/, 1)[0] ?? "";
  const segments = typedPath.split("/");
  if (segments.at(-1) === "") segments.pop();
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) invalid();

  const [owner, rawRepo, kind, ...rest] = segments;
  if (!owner || !rawRepo || !OWNER.test(owner)) invalid();

  const repo = rawRepo.replace(/\.git$/i, "");
  if (!REPO.test(repo) || repo === "." || repo === "..") invalid();
  if (kind === undefined) return { owner, repo };

  if (kind !== "tree" && kind !== "commit") invalid();
  const ref = rest.join("/");
  if (!REF.test(ref) || ref.startsWith("-")) invalid();
  if (kind === "commit" && !/^[0-9a-f]{7,40}$/i.test(ref)) invalid();
  return { owner, repo, ref };
}
