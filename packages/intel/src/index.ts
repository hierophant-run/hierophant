import type { PackageEcosystem, PackageRef, ScanStatus, Severity } from "@hierophant/engine";

const NPM_REGISTRY = "https://registry.npmjs.org";
const PYPI_API = "https://pypi.org/pypi";
const OSV_API = "https://api.osv.dev/v1";

const MAX_PACKAGES = 20;
const MAX_REFERENCES = 5;
const MAX_ADVISORIES = 5;
const MAX_DETAILS_PER_PACKAGE = 8;
const MAX_DETAILS_TOTAL = 40;
const CONCURRENCY = 6;
const DEFAULT_TIMEOUT_MS = 5_000;
const NEW_PACKAGE_DAYS = 30;

const NPM_DOC_LIMIT = 512 * 1024;
const VERSION_DOC_LIMIT = 1024 * 1024;
const PYPI_DOC_LIMIT = 2 * 1024 * 1024;
const OSV_LIMIT = 1024 * 1024;

const SAFE_VERSION = /^[0-9A-Za-z.+!_-]{1,64}$/;
const EXACT_NPM_VERSION = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.+-]+)?$/;
const NPM_TAG = /^[A-Za-z][0-9A-Za-z._-]{0,63}$/;
const ADVISORY_ID = /^[A-Za-z0-9-]{1,48}$/;
const MALICIOUS_CODE_CWE = "CWE-506";
const NPM_INSTALL_SCRIPTS = ["preinstall", "install", "postinstall"];

export type PackageVerdict =
  | "malicious"
  | "not_found"
  | "vulnerable"
  | "new_package"
  | "no_known_issues"
  | "unresolved"
  | "unavailable";

export type PackageFlag = "install_script" | "deprecated" | "yanked";

export type PackageCheck = {
  ecosystem: PackageEcosystem;
  name: string;
  requested: string | null;
  version: string | null;
  verdict: PackageVerdict;
  advisories: string[];
  advisoryCount: number;
  flags: PackageFlag[];
  createdAt: string | null;
  references: Array<{ path: string; line: number }>;
};

export type PackageSummary = {
  checkedAt: string;
  /** Packages left out because a scan checks a limited number. */
  omitted: number;
  checks: PackageCheck[];
};

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export const PACKAGE_VERDICT_LABELS: Record<PackageVerdict, string> = {
  malicious: "Listed as malicious",
  not_found: "Not in the registry",
  vulnerable: "Known vulnerabilities",
  new_package: "Recently created",
  no_known_issues: "No known issues",
  unresolved: "Version not resolved",
  unavailable: "Could not be checked",
};

export const PACKAGE_FLAG_LABELS: Record<PackageFlag, string> = {
  install_script: "Runs an install script",
  deprecated: "Deprecated",
  yanked: "Yanked",
};

const SEVERITY: Partial<Record<PackageVerdict, Severity>> = {
  malicious: "critical",
  not_found: "medium",
  vulnerable: "medium",
  new_package: "medium",
};

export const packageSeverity = (verdict: PackageVerdict) => SEVERITY[verdict] ?? null;

/** Package results can raise a verdict. They can never lower what the rules found. */
export function combineStatus(status: ScanStatus, summary: PackageSummary | null): ScanStatus {
  if (!summary) return status;
  if (summary.checks.some((check) => packageSeverity(check.verdict) === "critical")) {
    return "dangerous";
  }
  const needsReview = summary.checks.some((check) => packageSeverity(check.verdict) !== null);
  return status === "no_issues_found" && needsReview ? "needs_review" : status;
}

export const packageUrl = (check: Pick<PackageCheck, "ecosystem" | "name">) =>
  check.ecosystem === "npm"
    ? `https://www.npmjs.com/package/${check.name.split("/").map(encodeURIComponent).join("/")}`
    : `https://pypi.org/project/${encodeURIComponent(check.name)}/`;

/** A Python range such as >=1.0 is written after the name, without an @. */
export function packageDisplayName(
  check: Pick<PackageCheck, "ecosystem" | "name" | "requested" | "version">,
): string {
  if (check.version) return `${check.name}@${check.version}`;
  if (!check.requested) return check.name;
  const isRange = check.ecosystem === "PyPI" && /^[<>=!~]/.test(check.requested);
  return isRange ? `${check.name} ${check.requested}` : `${check.name}@${check.requested}`;
}

export const advisoryUrl = (id: string) =>
  `https://osv.dev/vulnerability/${encodeURIComponent(id)}`;

/** Rebuilds the input of a check from a stored result, so that it can be refreshed. */
export function summaryToRefs(summary: PackageSummary): PackageRef[] {
  return summary.checks.flatMap((check) =>
    check.references.map((reference) => ({
      ecosystem: check.ecosystem,
      name: check.name,
      requested: check.requested,
      ...reference,
    })),
  );
}

type JsonResult = { status: number; body: unknown };
type Lookup =
  | { state: "found"; version: string; flags: PackageFlag[]; createdAt: string | null }
  | { state: "missing" }
  | { state: "unresolved" }
  | { state: "failed" };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

async function readLimited(response: Response, maxBytes: number): Promise<string | null> {
  if (Number(response.headers.get("content-length") ?? "0") > maxBytes) {
    await response.body?.cancel();
    return null;
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return text + decoder.decode();
    total += value.length;
    if (total > maxBytes) {
      await reader.cancel();
      return null;
    }
    text += decoder.decode(value, { stream: true });
  }
}

/** Every response is untrusted. Oversized or invalid bodies come back as null. */
async function requestJson(
  fetchImpl: FetchLike,
  url: string,
  maxBytes: number,
  signal: AbortSignal,
  init: RequestInit = {},
): Promise<JsonResult> {
  const response = await fetchImpl(url, {
    ...init,
    signal,
    redirect: "manual",
    headers: { accept: "application/json", "user-agent": "hierophant", ...init.headers },
  });
  if (!response.ok) {
    await response.body?.cancel();
    return { status: response.status, body: null };
  }
  const text = await readLimited(response, maxBytes);
  if (text === null) return { status: response.status, body: null };
  try {
    return { status: response.status, body: JSON.parse(text) };
  } catch {
    return { status: response.status, body: null };
  }
}

const encodeNpmName = (name: string) => name.replace("/", "%2F");

async function npmCreatedAt(
  fetchImpl: FetchLike,
  name: string,
  signal: AbortSignal,
): Promise<string | null> {
  try {
    // New packages have small documents. A larger one is simply left without a date.
    const { body } = await requestJson(
      fetchImpl,
      `${NPM_REGISTRY}/${encodeNpmName(name)}`,
      NPM_DOC_LIMIT,
      signal,
    );
    if (!isRecord(body) || !isRecord(body.time)) return null;
    return typeof body.time.created === "string" ? body.time.created : null;
  } catch {
    return null;
  }
}

async function lookupNpm(
  fetchImpl: FetchLike,
  name: string,
  requested: string | null,
  signal: AbortSignal,
): Promise<Lookup> {
  const encoded = encodeNpmName(name);
  const isDirect =
    requested === null || EXACT_NPM_VERSION.test(requested) || NPM_TAG.test(requested);
  const target = isDirect ? (requested ?? "latest") : "latest";
  const { status, body } = await requestJson(
    fetchImpl,
    `${NPM_REGISTRY}/${encoded}/${encodeURIComponent(target)}`,
    VERSION_DOC_LIMIT,
    signal,
  );

  if (status === 404) {
    if (target === "latest") return { state: "missing" };
    const latest = await requestJson(
      fetchImpl,
      `${NPM_REGISTRY}/${encoded}/latest`,
      VERSION_DOC_LIMIT,
      signal,
    );
    if (latest.status === 404) return { state: "missing" };
    return latest.status === 200 ? { state: "unresolved" } : { state: "failed" };
  }
  if (status !== 200 || !isRecord(body)) return { state: "failed" };
  if (!isDirect) return { state: "unresolved" };
  if (typeof body.version !== "string" || !SAFE_VERSION.test(body.version)) {
    return { state: "failed" };
  }

  const flags: PackageFlag[] = [];
  const scripts = body.scripts;
  if (isRecord(scripts) && NPM_INSTALL_SCRIPTS.some((key) => Object.hasOwn(scripts, key))) {
    flags.push("install_script");
  }
  if (typeof body.deprecated === "string" && body.deprecated) flags.push("deprecated");
  return {
    state: "found",
    version: body.version,
    flags,
    createdAt: await npmCreatedAt(fetchImpl, name, signal),
  };
}

function earliestUpload(releases: unknown): string | null {
  if (!isRecord(releases)) return null;
  let earliest: string | null = null;
  for (const files of Object.values(releases)) {
    if (!Array.isArray(files)) continue;
    for (const file of files) {
      if (!isRecord(file) || typeof file.upload_time_iso_8601 !== "string") continue;
      const value = file.upload_time_iso_8601;
      if (Number.isNaN(Date.parse(value))) continue;
      if (earliest === null || Date.parse(value) < Date.parse(earliest)) earliest = value;
    }
  }
  return earliest;
}

async function lookupPyPI(
  fetchImpl: FetchLike,
  name: string,
  requested: string | null,
  signal: AbortSignal,
): Promise<Lookup> {
  const encoded = encodeURIComponent(name);
  const project = await requestJson(
    fetchImpl,
    `${PYPI_API}/${encoded}/json`,
    PYPI_DOC_LIMIT,
    signal,
  );
  if (project.status === 404) return { state: "missing" };
  if (project.status !== 200 || !isRecord(project.body) || !isRecord(project.body.info)) {
    return { state: "failed" };
  }

  const createdAt = earliestUpload(project.body.releases);
  if (requested === null) {
    const version = project.body.info.version;
    if (typeof version !== "string" || !SAFE_VERSION.test(version)) return { state: "failed" };
    return {
      state: "found",
      version,
      flags: project.body.info.yanked === true ? ["yanked"] : [],
      createdAt,
    };
  }
  if (!SAFE_VERSION.test(requested) || !/^\d/.test(requested)) return { state: "unresolved" };

  const release = await requestJson(
    fetchImpl,
    `${PYPI_API}/${encoded}/${encodeURIComponent(requested)}/json`,
    PYPI_DOC_LIMIT,
    signal,
  );
  if (release.status === 404) return { state: "unresolved" };
  if (release.status !== 200 || !isRecord(release.body) || !isRecord(release.body.info)) {
    return { state: "failed" };
  }
  return {
    state: "found",
    version: requested,
    flags: release.body.info.yanked === true ? ["yanked"] : [],
    createdAt,
  };
}

type OsvQuery = { package: { ecosystem: string; name: string }; version?: string };

async function queryOsv(
  fetchImpl: FetchLike,
  queries: readonly OsvQuery[],
  signal: AbortSignal,
): Promise<string[][] | null> {
  if (queries.length === 0) return [];
  try {
    const { status, body } = await requestJson(
      fetchImpl,
      `${OSV_API}/querybatch`,
      OSV_LIMIT,
      signal,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ queries }),
      },
    );
    if (status !== 200 || !isRecord(body) || !Array.isArray(body.results)) return null;
    if (body.results.length !== queries.length) return null;
    return body.results.map((result) => {
      if (!isRecord(result) || !Array.isArray(result.vulns)) return [];
      return result.vulns.flatMap((vuln) =>
        isRecord(vuln) && typeof vuln.id === "string" && ADVISORY_ID.test(vuln.id) ? [vuln.id] : [],
      );
    });
  } catch {
    return null;
  }
}

type Advisory = { id: string; malicious: boolean; withdrawn: boolean };

async function readAdvisory(
  fetchImpl: FetchLike,
  id: string,
  signal: AbortSignal,
): Promise<Advisory> {
  // If details cannot be read, an advisory still counts, and a MAL- entry stays malicious.
  const fallback = { id, malicious: id.startsWith("MAL-"), withdrawn: false };
  try {
    const { status, body } = await requestJson(
      fetchImpl,
      `${OSV_API}/vulns/${encodeURIComponent(id)}`,
      OSV_LIMIT,
      signal,
    );
    if (status !== 200 || !isRecord(body)) return fallback;
    const specific = isRecord(body.database_specific) ? body.database_specific : {};
    const cwes = Array.isArray(specific.cwe_ids) ? specific.cwe_ids : [];
    return {
      id,
      malicious: fallback.malicious || cwes.includes(MALICIOUS_CODE_CWE),
      withdrawn: typeof body.withdrawn === "string" && body.withdrawn.length > 0,
    };
  } catch {
    return fallback;
  }
}

async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  run: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await run(items[index]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

type Group = {
  ecosystem: PackageEcosystem;
  name: string;
  requested: string | null;
  references: Array<{ path: string; line: number }>;
};

function groupRefs(refs: readonly PackageRef[]) {
  const groups = new Map<string, Group>();
  for (const ref of refs) {
    const key = `${ref.ecosystem}:${ref.name}:${ref.requested}`;
    const group = groups.get(key) ?? {
      ecosystem: ref.ecosystem,
      name: ref.name,
      requested: ref.requested,
      references: [],
    };
    if (group.references.length < MAX_REFERENCES) {
      group.references.push({ path: ref.path, line: ref.line });
    }
    groups.set(key, group);
  }
  return [...groups.values()];
}

const VERDICT_ORDER: PackageVerdict[] = [
  "malicious",
  "not_found",
  "vulnerable",
  "new_package",
  "unavailable",
  "unresolved",
  "no_known_issues",
];

/**
 * Looks up package names in public registries and OSV. Only names and versions are sent.
 * Failures become `unavailable` and never fail the scan.
 */
export async function checkPackages(
  refs: readonly PackageRef[],
  options: { fetch: FetchLike; now?: Date; timeoutMs?: number; maxPackages?: number },
): Promise<PackageSummary> {
  const now = options.now ?? new Date();
  const signal = AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const allGroups = groupRefs(refs);
  const groups = allGroups.slice(0, Math.min(MAX_PACKAGES, options.maxPackages ?? MAX_PACKAGES));

  const lookups = await mapLimit(groups, CONCURRENCY, async (group): Promise<Lookup> => {
    try {
      return await (group.ecosystem === "npm" ? lookupNpm : lookupPyPI)(
        options.fetch,
        group.name,
        group.requested,
        signal,
      );
    } catch {
      return { state: "failed" };
    }
  });

  // A removed package can still have a malware advisory, so it is looked up without a version.
  const queries: Array<{ index: number; removed: boolean; query: OsvQuery }> = [];
  lookups.forEach((lookup, index) => {
    const group = groups[index]!;
    const pkg = { ecosystem: group.ecosystem, name: group.name };
    if (lookup.state === "missing") {
      queries.push({ index, removed: true, query: { package: pkg } });
    } else if (lookup.state === "found") {
      const removed = group.ecosystem === "npm" && lookup.version.endsWith("-security");
      queries.push({
        index,
        removed,
        query: removed ? { package: pkg } : { package: pkg, version: lookup.version },
      });
    }
  });

  const results = await queryOsv(
    options.fetch,
    queries.map((entry) => entry.query),
    signal,
  );

  let detailBudget = MAX_DETAILS_TOTAL;
  const advisories = new Map<number, Advisory[]>();
  const removedPackages = new Set(queries.filter((q) => q.removed).map((q) => q.index));
  if (results) {
    await mapLimit(queries, CONCURRENCY, async (entry) => {
      const ids = results[queries.indexOf(entry)] ?? [];
      const take = Math.max(0, Math.min(ids.length, MAX_DETAILS_PER_PACKAGE, detailBudget));
      detailBudget -= take;
      const detailed = await mapLimit(ids.slice(0, take), CONCURRENCY, (id) =>
        readAdvisory(options.fetch, id, signal),
      );
      const rest = ids
        .slice(take)
        .map((id) => ({ id, malicious: id.startsWith("MAL-"), withdrawn: false }));
      advisories.set(
        entry.index,
        [...detailed, ...rest].filter((advisory) => !advisory.withdrawn),
      );
    });
  }

  const checks = groups.map((group, index): PackageCheck => {
    const lookup = lookups[index]!;
    const found = lookup.state === "found" ? lookup : null;
    const items = advisories.get(index) ?? [];
    const malicious = items.filter((advisory) => advisory.malicious);
    const isRemoved = removedPackages.has(index);
    const listed = (malicious.length > 0 ? malicious : items).map((advisory) => advisory.id);

    let verdict: PackageVerdict;
    if (malicious.length > 0) verdict = "malicious";
    else if (lookup.state === "missing") verdict = "not_found";
    else if (lookup.state === "failed") verdict = "unavailable";
    else if (lookup.state === "unresolved") verdict = "unresolved";
    else if (!results) verdict = "unavailable";
    else if (isRemoved) verdict = "not_found";
    else if (items.length > 0) verdict = "vulnerable";
    else if (
      found?.createdAt &&
      now.getTime() - Date.parse(found.createdAt) < NEW_PACKAGE_DAYS * 86_400_000
    ) {
      verdict = "new_package";
    } else verdict = "no_known_issues";

    return {
      ecosystem: group.ecosystem,
      name: group.name,
      requested: group.requested,
      version: found?.version ?? null,
      verdict,
      advisories: listed.slice(0, MAX_ADVISORIES),
      advisoryCount: listed.length,
      flags: found?.flags ?? [],
      createdAt: found?.createdAt ?? null,
      references: group.references,
    };
  });

  checks.sort(
    (a, b) =>
      VERDICT_ORDER.indexOf(a.verdict) - VERDICT_ORDER.indexOf(b.verdict) ||
      (a.name < b.name ? -1 : a.name > b.name ? 1 : 0),
  );
  return {
    checkedAt: now.toISOString(),
    omitted: allGroups.length - groups.length,
    checks,
  };
}
