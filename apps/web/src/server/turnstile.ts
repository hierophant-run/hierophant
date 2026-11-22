import type { FetchLike } from "./github-client";
import { errorName, logError } from "./log";

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const TIMEOUT_MS = 4_000;
export const MAX_TOKEN_LENGTH = 2048;
/** These codes describe a problem on our side or Cloudflare's, not the visitor. */
const SERVICE_ERRORS = new Set(["missing-input-secret", "invalid-input-secret", "internal-error"]);

export type TurnstileResult = "passed" | "rejected" | "unavailable";

/** The visitor's IP address is optional for this API and is deliberately not sent. */
export async function verifyTurnstile(
  token: unknown,
  secret: string,
  fetchImpl: FetchLike,
): Promise<TurnstileResult> {
  if (typeof token !== "string" || !token || token.length > MAX_TOKEN_LENGTH) return "rejected";

  try {
    const response = await fetchImpl(SITEVERIFY_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ secret, response: token }),
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) {
      await response.body?.cancel();
      logError("turnstile_unavailable", { status: response.status });
      return "unavailable";
    }
    const body = (await response.json()) as { success?: unknown; "error-codes"?: unknown };
    if (body.success === true) return "passed";

    const codes = Array.isArray(body["error-codes"]) ? body["error-codes"] : [];
    const serviceError = codes.find((code) => SERVICE_ERRORS.has(String(code)));
    if (serviceError !== undefined) {
      logError("turnstile_unavailable", { code: String(serviceError) });
      return "unavailable";
    }
    return "rejected";
  } catch (error) {
    logError("turnstile_unavailable", { cause: errorName(error) });
    return "unavailable";
  }
}
