import { RULESET_VERSION, type Finding, type ScanStatus, type Severity } from "@hierophant/engine";
import type { CheckTarget } from "@/lib/check-target";
import { ApiError } from "../errors";
import type { FetchLike } from "../github-client";

export type CheckSeverity = Severity | "info";

export type CheckSignal = {
  severity: CheckSeverity;
  title: string;
  detail: string;
  location?: string;
  href?: string;
};

export type CheckDetail = { label: string; value: string; note?: string };
export type CheckInspection = { label: string; isFound: boolean };
export type TokenDetails = {
  text: CheckDetail[];
  inspections: CheckInspection[];
  market: CheckDetail[] | null;
};

export type CheckResult = {
  target: CheckTarget;
  kindLabel: string;
  name: string;
  subtitle: string;
  sourceUrl: string;
  status: ScanStatus;
  statusLabel: string;
  rulesetVersion: string;
  checkedAt: string;
  signals: CheckSignal[];
  checked: string[];
  notChecked: string[];
  notice: string;
  tokenDetails?: TokenDetails;
};

export type CheckContext = {
  fetch: FetchLike;
  githubToken?: string;
  /** Badges skip these figures so that embedded images do not load third-party sources. */
  includeTokenData?: boolean;
};

const RANK: Record<CheckSeverity, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
const STATUS_LABELS: Record<ScanStatus, string> = {
  dangerous: "Dangerous",
  needs_review: "Needs review",
  no_issues_found: "No issues found",
};

/** Text from registries and blockchains is untrusted, so hidden characters are made visible. */
export const cleanText = (value: string, max = 140) =>
  value.replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, "?").slice(0, max);

export function safeHttpsUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 500) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

export function statusFromSignals(signals: readonly CheckSignal[]): ScanStatus {
  if (signals.some((signal) => RANK[signal.severity] <= RANK.high)) return "dangerous";
  return signals.some((signal) => signal.severity !== "info") ? "needs_review" : "no_issues_found";
}

export const findingSignal = (finding: Finding, location?: string, href?: string): CheckSignal => ({
  severity: finding.severity,
  title: finding.title,
  detail: `${finding.why} ${finding.fix}`,
  ...(location ? { location } : {}),
  ...(href ? { href } : {}),
});

type ResultInput = Omit<
  CheckResult,
  "status" | "statusLabel" | "rulesetVersion" | "checkedAt" | "notice"
> & {
  statusLabels?: Record<ScanStatus, string>;
  notice?: string;
};

export function buildResult({ statusLabels, notice, signals, ...input }: ResultInput): CheckResult {
  const unique = new Map(
    signals.map((signal) => [`${signal.title}:${signal.location ?? ""}`, signal]),
  );
  const sorted = [...unique.values()].sort((a, b) => RANK[a.severity] - RANK[b.severity]);
  const status = statusFromSignals(sorted);
  return {
    ...input,
    signals: sorted,
    status,
    statusLabel: (statusLabels ?? STATUS_LABELS)[status],
    rulesetVersion: RULESET_VERSION,
    checkedAt: new Date().toISOString(),
    notice:
      notice ??
      (status === "no_issues_found"
        ? `No issues found by ruleset v${RULESET_VERSION}. This is not a guarantee.`
        : "These are automated review signals from static checks. They are not a guarantee."),
  };
}

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

/** Fetches JSON from a fixed host. Redirects, oversized bodies, and bad JSON are failures. */
export async function fetchJson(
  fetchImpl: FetchLike,
  url: string,
  init: RequestInit,
  maxBytes: number,
): Promise<{ status: number; body: unknown }> {
  let response: Response;
  try {
    response = await fetchImpl(url, { ...init, redirect: "manual" });
  } catch {
    throw new ApiError("check_unavailable");
  }
  if (!response.ok) {
    await response.body?.cancel();
    return { status: response.status, body: null };
  }
  try {
    const text = await readLimited(response, maxBytes);
    if (text === null) throw new ApiError("check_unavailable");
    return { status: response.status, body: JSON.parse(text) };
  } catch {
    throw new ApiError("check_unavailable");
  }
}

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
