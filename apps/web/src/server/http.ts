import { ApiError } from "./errors";
import { isFeedbackReason } from "./feedback";
import type { FetchLike } from "./github-client";
import { GitHubClient } from "./github-client";
import { parseGitHubUrl } from "./github-url";
import { errorName, logError } from "./log";
import type { RateLimiter } from "./rate-limit";
import { runMonitors, watchRepository } from "./monitor-service";
import type { MonitorStore } from "./monitor-store";
import { isReportId, type ReportStore } from "./report-store";
import { toReportView, type ReportView } from "./report-view";
import { ScanBudget } from "./scan-budget";
import type { ProgressListener } from "./scan-progress";
import { guardDatabase, runScan } from "./scan-service";
import { verifyTurnstile } from "./turnstile";

const MAX_BODY_BYTES = 2048;
/** A Turnstile token alone can be 2,048 characters. */
const MAX_SCAN_BODY_BYTES = 4096;
const DEFAULT_SCAN_TIMEOUT_MS = 20_000;

export type ScanDeps = {
  store: ReportStore;
  limiter: RateLimiter;
  feedbackLimiter?: RateLimiter;
  checkLimiter?: RateLimiter;
  fetch: FetchLike;
  githubToken?: string;
  turnstileSecret?: string;
  /** Outbound requests one scan may make on hosts with a per-request cap. */
  subrequestLimit?: number;
  siteUrl?: string;
  monitors?: MonitorStore;
  scanTimeoutMs?: number;
  treeTimeoutMs?: number;
};

const RESPONSE_HEADERS = {
  "Cache-Control": "no-store",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
  "Content-Type": "application/json; charset=utf-8",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Robots-Tag": "noindex",
};

function jsonResponse(body: unknown, status: number, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...RESPONSE_HEADERS, ...headers },
  });
}

type Route = "scan" | "report" | "feedback" | "watch" | "monitor";

function toApiError(error: unknown, route: Route): ApiError {
  const apiError = error instanceof ApiError ? error : new ApiError("internal_error");
  if (apiError.status >= 500) {
    // Messages can contain connection details, so only fixed codes and the error type are logged.
    logError("api_error", {
      route,
      code: apiError.code,
      status: apiError.status,
      ...(error instanceof ApiError ? {} : { cause: errorName(error) }),
    });
  }
  return apiError;
}

function errorResponse(error: unknown, route: Route): Response {
  const apiError = toApiError(error, route);
  const headers: HeadersInit = apiError.retryAfterSeconds
    ? { "Retry-After": String(apiError.retryAfterSeconds) }
    : {};
  return jsonResponse(
    { error: { code: apiError.code, message: apiError.message } },
    apiError.status,
    headers,
  );
}

function assertSameOrigin(request: Request, siteUrl?: string): void {
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") {
    throw new ApiError("forbidden_origin");
  }

  const origin = request.headers.get("origin");
  if (!origin) return;

  let originUrl: URL;
  try {
    originUrl = new URL(origin);
  } catch {
    throw new ApiError("forbidden_origin");
  }
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const matchesHost = host !== null && originUrl.host === host;
  let matchesSite = false;
  if (siteUrl) {
    try {
      matchesSite = originUrl.origin === new URL(siteUrl).origin;
    } catch {
      matchesSite = false;
    }
  }
  if (!matchesHost && !matchesSite) throw new ApiError("forbidden_origin");
}

async function readBody(request: Request, maxBytes = MAX_BODY_BYTES): Promise<unknown> {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== "application/json") throw new ApiError("unsupported_media_type");

  if (Number(request.headers.get("content-length") ?? "0") > maxBytes) {
    throw new ApiError("payload_too_large");
  }
  if (!request.body) throw new ApiError("invalid_request");

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > maxBytes) {
      await reader.cancel();
      throw new ApiError("payload_too_large");
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new ApiError("invalid_request");
  }
}

export function clientIp(request: { headers: { get(name: string): string | null } }): string {
  // Behind Cloudflare, other forwarding headers can be set by the visitor.
  const candidate =
    process.env.DEPLOY_TARGET === "cloudflare"
      ? request.headers.get("cf-connecting-ip")
      : (request.headers.get("x-vercel-forwarded-for") ??
        request.headers.get("x-real-ip") ??
        request.headers.get("x-forwarded-for"));
  const first = candidate?.split(",", 1)[0]?.trim() ?? "";
  return /^[0-9a-fA-F:.]{2,45}$/.test(first) ? first : "unknown";
}

type ScanRun = (onProgress?: ProgressListener) => Promise<{
  report: ReportView;
  cached: boolean;
}>;

/** Sends one JSON event per line, so the browser can show what the scan is really doing. */
function streamScan(run: ScanRun): Response {
  const encoder = new TextEncoder();
  let isClosed = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: unknown) => {
        if (!isClosed) controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };
      try {
        const { report, cached } = await run((progress) => {
          send({ type: "progress", ...progress });
        });
        send({ type: "result", report, cached });
      } catch (error) {
        const { code, message } = toApiError(error, "scan");
        send({ type: "error", error: { code, message } });
      } finally {
        if (!isClosed) {
          isClosed = true;
          controller.close();
        }
      }
    },
    cancel() {
      isClosed = true;
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      ...RESPONSE_HEADERS,
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "X-Accel-Buffering": "no",
    },
  });
}

export async function handleScanRequest(
  request: Request,
  getDeps: () => ScanDeps,
): Promise<Response> {
  try {
    const deps = getDeps();
    assertSameOrigin(request, deps.siteUrl);

    const body = await readBody(request, MAX_SCAN_BODY_BYTES);
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      throw new ApiError("invalid_request");
    }
    const keys = Object.keys(body);
    if (!keys.includes("url") || keys.some((key) => key !== "url" && key !== "turnstileToken")) {
      throw new ApiError("invalid_request");
    }
    const { url, turnstileToken } = body as { url: unknown; turnstileToken?: unknown };
    const target = parseGitHubUrl(url);

    const limit = await guardDatabase(() => deps.limiter.consume(clientIp(request)));
    if (!limit.allowed) throw new ApiError("rate_limited", limit.retryAfterSeconds);

    const budget = deps.subrequestLimit ? new ScanBudget(deps.subrequestLimit) : undefined;
    const scanFetch = budget ? budget.wrap(deps.fetch) : deps.fetch;

    if (deps.turnstileSecret) {
      // During a Cloudflare outage, scans continue behind the rate limit above.
      const check = await verifyTurnstile(turnstileToken, deps.turnstileSecret, scanFetch);
      if (check === "rejected") throw new ApiError("bot_check_failed");
    }

    const signal = AbortSignal.timeout(deps.scanTimeoutMs ?? DEFAULT_SCAN_TIMEOUT_MS);
    const github = new GitHubClient({
      fetch: scanFetch,
      signal,
      ...(deps.githubToken ? { token: deps.githubToken } : {}),
    });
    const run: ScanRun = (onProgress) =>
      runScan(target, github, deps.store, deps.treeTimeoutMs, onProgress, scanFetch, budget);

    if (request.headers.get("accept")?.includes("application/x-ndjson")) {
      return streamScan(run);
    }
    const { report, cached } = await run();
    return jsonResponse({ report, cached }, cached ? 200 : 201);
  } catch (error) {
    return errorResponse(error, "scan");
  }
}

export async function handleFeedbackRequest(
  request: Request,
  id: string,
  getDeps: () => ScanDeps,
): Promise<Response> {
  try {
    if (!isReportId(id)) throw new ApiError("report_not_found");
    const deps = getDeps();
    assertSameOrigin(request, deps.siteUrl);

    const body = await readBody(request);
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      throw new ApiError("invalid_request");
    }
    const keys = Object.keys(body).sort();
    if (keys.length !== 2 || keys[0] !== "position" || keys[1] !== "reason") {
      throw new ApiError("invalid_request");
    }
    const { position, reason } = body as { position: unknown; reason: unknown };
    if (!Number.isSafeInteger(position) || (position as number) < 0) {
      throw new ApiError("invalid_request");
    }
    if (!isFeedbackReason(reason)) throw new ApiError("invalid_request");

    const limiter = deps.feedbackLimiter ?? deps.limiter;
    const limit = await guardDatabase(() => limiter.consume(clientIp(request)));
    if (!limit.allowed) throw new ApiError("rate_limited", limit.retryAfterSeconds);

    const recorded = await guardDatabase(() =>
      deps.store.recordFeedback(id, position as number, reason),
    );
    if (!recorded) throw new ApiError("report_not_found");
    return jsonResponse({ ok: true }, 201);
  } catch (error) {
    return errorResponse(error, "feedback");
  }
}

export async function handleReportRequest(id: string, getDeps: () => ScanDeps): Promise<Response> {
  try {
    if (!isReportId(id)) throw new ApiError("report_not_found");
    const { store } = getDeps();
    const report = await guardDatabase(() => store.findById(id));
    if (!report) throw new ApiError("report_not_found");
    return jsonResponse({ report: toReportView(report) }, 200);
  } catch (error) {
    return errorResponse(error, "report");
  }
}

/** Starts watching the repository behind a report. */
export async function handleWatchRequest(
  request: Request,
  getDeps: () => ScanDeps,
): Promise<Response> {
  try {
    const deps = getDeps();
    if (!deps.monitors) throw new ApiError("service_unavailable");
    assertSameOrigin(request, deps.siteUrl);

    const body = await readBody(request);
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      throw new ApiError("invalid_request");
    }
    const keys = Object.keys(body);
    const { reportId } = body as { reportId?: unknown };
    if (keys.length !== 1 || typeof reportId !== "string" || !isReportId(reportId)) {
      throw new ApiError("invalid_request");
    }

    const limit = await guardDatabase(() => deps.limiter.consume(clientIp(request)));
    if (!limit.allowed) throw new ApiError("rate_limited", limit.retryAfterSeconds);

    const { monitor, created } = await watchRepository(reportId, {
      store: deps.store,
      monitors: deps.monitors,
      fetch: deps.fetch,
      ...(deps.githubToken ? { githubToken: deps.githubToken } : {}),
    });
    const path = `/w/${encodeURIComponent(monitor.owner)}/${encodeURIComponent(monitor.repo)}`;
    return jsonResponse({ path, created }, created ? 201 : 200);
  } catch (error) {
    return errorResponse(error, "watch");
  }
}

/** Only the scheduled trigger can set this header. The Worker removes it from outside requests. */
export const CRON_HEADER = "x-hierophant-cron";

export async function handleMonitorRun(
  request: Request,
  getDeps: () => ScanDeps,
): Promise<Response> {
  if (request.headers.get(CRON_HEADER) !== "1") {
    return jsonResponse({ error: { code: "not_found", message: "Not found." } }, 404);
  }
  try {
    const deps = getDeps();
    if (!deps.monitors) throw new ApiError("service_unavailable");
    const summary = await runMonitors({
      store: deps.store,
      monitors: deps.monitors,
      fetch: deps.fetch,
      ...(deps.githubToken ? { githubToken: deps.githubToken } : {}),
      ...(deps.subrequestLimit ? { subrequestLimit: deps.subrequestLimit } : {}),
    });
    return jsonResponse(summary, 200);
  } catch (error) {
    return errorResponse(error, "monitor");
  }
}
