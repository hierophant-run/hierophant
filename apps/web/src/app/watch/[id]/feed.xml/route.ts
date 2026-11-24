import { getMonitors } from "@/server/deps";
import { loadWatchById, renderFeed } from "@/server/watch-view";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
  const { id } = await params;
  try {
    const data = await loadWatchById(id, getMonitors());
    if (!data)
      return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
    return new Response(renderFeed(data), {
      headers: {
        "Content-Type": "application/atom+xml; charset=utf-8",
        "Cache-Control": "public, max-age=600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("Unavailable", { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
