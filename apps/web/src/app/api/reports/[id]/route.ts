import { getDeps } from "@/server/deps";
import { handleReportRequest } from "@/server/http";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handleReportRequest(id, getDeps);
}
