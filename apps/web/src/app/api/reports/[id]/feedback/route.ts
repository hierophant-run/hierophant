import { getDeps } from "@/server/deps";
import { handleFeedbackRequest } from "@/server/http";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handleFeedbackRequest(request, id, getDeps);
}
