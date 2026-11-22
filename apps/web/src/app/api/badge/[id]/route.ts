import { handleBadgeRequest } from "@/server/badge";
import { getDeps } from "@/server/deps";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handleBadgeRequest(id, getDeps);
}
