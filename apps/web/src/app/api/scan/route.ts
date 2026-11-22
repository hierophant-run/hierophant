import { getDeps } from "@/server/deps";
import { handleScanRequest } from "@/server/http";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: Request) {
  return handleScanRequest(request, getDeps);
}
