import handler from "./.open-next/worker.js";

const BADGE_CACHE_PREFIX = "/api/badge/check/";

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
  async fetch(request, env, context) {
    const { pathname } = new URL(request.url);
    if (request.method === "GET" && pathname.startsWith(BADGE_CACHE_PREFIX)) {
      return cachedBadge(request, env, context);
    }

    const response = await handler.fetch(request, env, context);
    if (!pathname.startsWith("/r/") && !pathname.startsWith("/check/")) return response;

    const protectedResponse = new Response(response.body, response);
    protectedResponse.headers.set("Cache-Control", "private, no-store, no-transform");
    return protectedResponse;
  },
};

export default worker;
