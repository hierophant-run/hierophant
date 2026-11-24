import handler from "./.open-next/worker.js";

const BADGE_CACHE_PREFIXES = ["/api/badge/check/", "/api/badge/watch/"];
const CRON_HEADER = "x-hierophant-cron";
const MONITOR_URL = "https://hierophanthq.com/api/monitor/run";

/** Check badges appear in READMEs, so popular ones are served from Cloudflare's cache. */
async function cachedBadge(request, env, context) {
  const cache = globalThis.caches?.default;
  const key = new Request(request.url);
  const hit = await cache?.match(key);
  if (hit) return hit;

  const response = await handler.fetch(request, env, context);
  if (cache && response.status === 200) context.waitUntil(cache.put(key, response.clone()));
  return response;
}

/**
 * Report and check pages use a nonce, and Cloudflare can reuse it to inject its analytics
 * script. This header stops that on every response, including 404 pages.
 */
const worker = {
  async fetch(incoming, env, context) {
    // Only the scheduled trigger below may mark a request as coming from the cron.
    let request = incoming;
    if (incoming.headers.has(CRON_HEADER)) {
      const headers = new Headers(incoming.headers);
      headers.delete(CRON_HEADER);
      request = new Request(incoming, { headers });
    }

    const { pathname } = new URL(request.url);
    if (
      request.method === "GET" &&
      BADGE_CACHE_PREFIXES.some((prefix) => pathname.startsWith(prefix))
    ) {
      return cachedBadge(request, env, context);
    }

    const response = await handler.fetch(request, env, context);
    const isNoncePage =
      pathname.startsWith("/r/") ||
      pathname.startsWith("/check/") ||
      (pathname.startsWith("/w/") && !pathname.endsWith("/feed.xml"));
    if (!isNoncePage) return response;

    const protectedResponse = new Response(response.body, response);
    protectedResponse.headers.set("Cache-Control", "private, no-store, no-transform");
    return protectedResponse;
  },

  /** Checks watched repositories. Runs on the schedule in wrangler.jsonc. */
  async scheduled(_event, env, context) {
    const request = new Request(MONITOR_URL, { method: "POST", headers: { [CRON_HEADER]: "1" } });
    context.waitUntil(
      handler.fetch(request, env, context).then(async (response) => {
        if (!response.ok)
          console.error(
            JSON.stringify({
              level: "error",
              event: "monitor_run_failed",
              status: response.status,
            }),
          );
        await response.body?.cancel();
      }),
    );
  },
};

export default worker;
