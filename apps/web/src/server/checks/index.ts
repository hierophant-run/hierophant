import { checkPath, parseCheckPath, type CheckTarget } from "@/lib/check-target";
import { SITE_URL } from "@/lib/site";
import { renderCheckBadge } from "../badge";
import { ApiError } from "../errors";
import { clientIp, type ScanDeps } from "../http";
import { errorName, logError } from "../log";
import { ScanBudget } from "../scan-budget";
import { guardDatabase } from "../scan-service";
import type { CheckContext, CheckResult } from "./common";
import { runMcpCheck } from "./mcp";
import { runPackageCheck } from "./packages";
import { runSkillCheck } from "./skill";
import { runTokenCheck } from "./token";

export type { CheckResult, CheckSignal } from "./common";

const BADGE_CACHE_SECONDS = 3600;

export function runCheck(target: CheckTarget, context: CheckContext): Promise<CheckResult> {
  switch (target.kind) {
    case "npm":
    case "pypi":
      return runPackageCheck(target, context);
    case "mcp":
      return runMcpCheck(target, context);
    case "skill":
      return runSkillCheck(target, context);
    case "token":
      return runTokenCheck(target, context);
  }
}

/** Applies the rate limit and hosting request budget around one check. */
export async function loadCheck(
  target: CheckTarget,
  request: { headers: { get(name: string): string | null } },
  deps: ScanDeps,
): Promise<CheckResult> {
  const limiter = deps.checkLimiter ?? deps.limiter;
  const limit = await guardDatabase(() => limiter.consume(clientIp(request)));
  if (!limit.allowed) throw new ApiError("rate_limited", limit.retryAfterSeconds);

  const budget = deps.subrequestLimit ? new ScanBudget(deps.subrequestLimit) : undefined;
  try {
    return await runCheck(target, {
      fetch: budget ? budget.wrap(deps.fetch) : deps.fetch,
      ...(deps.githubToken ? { githubToken: deps.githubToken } : {}),
    });
  } catch (error) {
    if (error instanceof ApiError) throw error;
    // Messages can quote remote data, so only the error type is logged.
    logError("check_failed", { kind: target.kind, cause: errorName(error) });
    throw new ApiError("check_unavailable");
  }
}

export const checkBadgePath = (target: CheckTarget) => `/api/badge${checkPath(target)}`;

export function checkBadgeMarkdown(result: CheckResult, siteUrl: string = SITE_URL): string {
  const label = result.target.kind === "token" ? "Token metadata" : "Checked by Hierophant";
  return `[![${label}](${siteUrl}${checkBadgePath(result.target)})](${siteUrl}${checkPath(result.target)})`;
}

export async function handleCheckBadgeRequest(
  request: Request,
  kind: string,
  segments: readonly string[],
  getDeps: () => ScanDeps,
  siteUrl: string = SITE_URL,
): Promise<Response> {
  const ref = new URL(request.url).searchParams.get("ref");
  const target = parseCheckPath(kind, segments, ref);
  if (!target) return renderCheckBadge({ kind, message: "Not found", httpStatus: 404 });

  try {
    const result = await loadCheck(target, request, getDeps());
    return renderCheckBadge({
      kind: target.kind,
      status: result.status,
      message:
        target.kind === "token"
          ? `${result.statusLabel} \u00B7 not a safety rating`
          : `${result.statusLabel} \u00B7 v${result.rulesetVersion}`,
      href: `${siteUrl}${checkPath(target)}`,
      httpStatus: 200,
      maxAge: BADGE_CACHE_SECONDS,
    });
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    const message =
      status === 404 ? "Not found" : status === 429 ? "Try again later" : "Unavailable";
    return renderCheckBadge({ kind, message, httpStatus: status });
  }
}
