import "server-only";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool, type PoolConfig } from "pg";
import type { Database } from "./db/types";
import { ApiError } from "./errors";
import type { ScanDeps } from "./http";
import { errorName, logError } from "./log";
import { FEEDBACK_LIMITS, RateLimiter } from "./rate-limit";
import { ReportStore } from "./report-store";

type Shared = {
  pool: Pool;
  store: ReportStore;
  limiter: RateLimiter;
  feedbackLimiter: RateLimiter;
};

const globalCache = globalThis as typeof globalThis & { __hierophantDb?: Shared };

/** Workers cannot reuse a socket across requests, so each request gets its own connection. */
const isOnWorkers = () => process.env.DEPLOY_TARGET === "cloudflare";

function poolConfig(databaseUrl: string): PoolConfig {
  const url = new URL(databaseUrl);
  // Channel binding needs the peer certificate, which Workers sockets do not expose.
  const enableChannelBinding =
    !isOnWorkers() && url.searchParams.get("channel_binding") === "require";
  // TLS is set explicitly below, so these driver-specific query options are removed.
  url.searchParams.delete("sslmode");
  url.searchParams.delete("channel_binding");

  return {
    connectionString: url.toString(),
    ssl: { rejectUnauthorized: true },
    max: isOnWorkers() ? 1 : 3,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 8_000,
    ...(enableChannelBinding ? { enableChannelBinding: true } : {}),
  } as PoolConfig;
}

function createShared(databaseUrl: string): Shared {
  const pool = new Pool(poolConfig(databaseUrl));
  // An idle client error must not crash the server, and its message may hold connection details.
  pool.on("error", (error) => logError("database_pool_error", { cause: errorName(error) }));
  const db = drizzle(pool) as unknown as Database;
  return {
    pool,
    store: new ReportStore(db),
    limiter: new RateLimiter(db, databaseUrl),
    feedbackLimiter: new RateLimiter(db, databaseUrl, FEEDBACK_LIMITS),
  };
}

function shared(databaseUrl: string): Shared {
  if (isOnWorkers()) return createShared(databaseUrl);
  globalCache.__hierophantDb ??= createShared(databaseUrl);
  return globalCache.__hierophantDb;
}

export function getDeps(): ScanDeps {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new ApiError("service_unavailable");

  const { store, limiter, feedbackLimiter } = shared(databaseUrl);
  const githubToken = process.env.GITHUB_TOKEN;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  const turnstileSecret = process.env.TURNSTILE_SECRET_KEY;
  const subrequestLimit = Number(process.env.SCAN_SUBREQUEST_LIMIT);
  return {
    store,
    limiter,
    feedbackLimiter,
    fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
    ...(githubToken ? { githubToken } : {}),
    ...(siteUrl ? { siteUrl } : {}),
    ...(turnstileSecret ? { turnstileSecret } : {}),
    ...(Number.isSafeInteger(subrequestLimit) && subrequestLimit > 0 ? { subrequestLimit } : {}),
  };
}
