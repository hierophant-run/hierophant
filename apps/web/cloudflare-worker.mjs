import handler from "./.open-next/worker.js";

/**
 * Report pages use a nonce, and Cloudflare can reuse it to inject its analytics script.
 * This header stops that on every report response, including 404 pages.
 */
const worker = {
  async fetch(request, env, context) {
    const response = await handler.fetch(request, env, context);
    if (!new URL(request.url).pathname.startsWith("/r/")) return response;

    const protectedResponse = new Response(response.body, response);
    protectedResponse.headers.set("Cache-Control", "private, no-store, no-transform");
    return protectedResponse;
  },
};

export default worker;
