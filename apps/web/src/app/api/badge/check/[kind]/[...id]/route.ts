import { handleCheckBadgeRequest } from "@/server/checks";
import { getDeps } from "@/server/deps";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ kind: string; id: string[] }> },
) {
  const { kind, id } = await params;
  return handleCheckBadgeRequest(request, kind, id, getDeps);
}
