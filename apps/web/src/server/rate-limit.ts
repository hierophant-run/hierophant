import { createHmac } from "node:crypto";
import { lt, sql } from "drizzle-orm";
import { rateLimits } from "./db/schema";
import type { Database } from "./db/types";

type Limit = { scope: "ip" | "global"; name: string; windowSeconds: number; max: number };

export const SCAN_LIMITS: readonly Limit[] = [
  { scope: "ip", name: "ip-minute", windowSeconds: 60, max: 10 },
  { scope: "ip", name: "ip-hour", windowSeconds: 3600, max: 60 },
  { scope: "global", name: "global-hour", windowSeconds: 3600, max: 600 },
];

export const FEEDBACK_LIMITS: readonly Limit[] = [
  { scope: "ip", name: "feedback-minute", windowSeconds: 60, max: 10 },
  { scope: "ip", name: "feedback-hour", windowSeconds: 3600, max: 40 },
];

const CLEANUP_CHANCE = 0.01;
const RETENTION_MS = 2 * 60 * 60 * 1000;

export type RateLimitResult = { allowed: true } | { allowed: false; retryAfterSeconds: number };

export class RateLimiter {
  constructor(
    private readonly db: Database,
    private readonly secret: string,
    private readonly limits: readonly Limit[] = SCAN_LIMITS,
    private readonly now: () => number = Date.now,
  ) {}

  private keyFor(limit: Limit, ip: string): string {
    if (limit.scope === "global") return limit.name;
    const hash = createHmac("sha256", this.secret).update(ip).digest("hex").slice(0, 32);
    return `${limit.name}:${hash}`;
  }

  async consume(ip: string): Promise<RateLimitResult> {
    const now = this.now();
    let blockedFor = 0;

    for (const limit of this.limits) {
      const windowMs = limit.windowSeconds * 1000;
      const windowStart = Math.floor(now / windowMs) * windowMs;
      const [row] = await this.db
        .insert(rateLimits)
        .values({ key: this.keyFor(limit, ip), windowStart: new Date(windowStart), count: 1 })
        .onConflictDoUpdate({
          target: [rateLimits.key, rateLimits.windowStart],
          set: { count: sql`${rateLimits.count} + 1` },
        })
        .returning({ count: rateLimits.count });

      if ((row?.count ?? 0) > limit.max) {
        blockedFor = Math.max(blockedFor, Math.ceil((windowStart + windowMs - now) / 1000));
      }
    }

    if (Math.random() < CLEANUP_CHANCE) {
      await this.db
        .delete(rateLimits)
        .where(lt(rateLimits.windowStart, new Date(now - RETENTION_MS)));
    }
    return blockedFor > 0
      ? { allowed: false, retryAfterSeconds: Math.max(1, blockedFor) }
      : { allowed: true };
  }
}
