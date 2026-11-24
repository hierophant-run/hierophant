import { SITE_URL } from "@/lib/site";
import { renderWatchBadge } from "@/server/badge";
import { getMonitors } from "@/server/deps";
import { loadWatch, watchPath } from "@/server/watch-view";

export const runtime = "nodejs";

type Context = { params: Promise<{ owner: string; repo: string }> };

export async function GET(_request: Request, { params }: Context) {
  const { owner, repo } = await params;
  const href = `${SITE_URL}/w/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  try {
    const monitors = getMonitors();
    const data = await loadWatch(owner, repo, monitors);
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
