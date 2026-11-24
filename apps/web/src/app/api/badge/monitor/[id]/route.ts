import { SITE_URL } from "@/lib/site";
import { renderWatchBadge } from "@/server/badge";
import { getMonitors } from "@/server/deps";
import { loadWatchById, watchPath } from "@/server/watch-view";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
  const { id } = await params;
  const href = `${SITE_URL}/watch/${encodeURIComponent(id)}`;
  try {
    const data = await loadWatchById(id, getMonitors());
    if (!data)
      return renderWatchBadge({ status: null, href, httpStatus: 404, message: "Not watched" });
    return renderWatchBadge({
      status: data.latest?.status ?? null,
      href: `${SITE_URL}${watchPath(data.monitor)}`,
    });
  } catch {
    return renderWatchBadge({ status: null, href, httpStatus: 503, message: "Unavailable" });
  }
}
