import { CONTACT_EMAIL, SITE_URL } from "@/lib/site";
import { buildSecurityTxt } from "@/server/security-txt";

export function GET() {
  // The format requires a real contact, so the file does not exist until one is configured.
  if (!CONTACT_EMAIL) return new Response("Not found", { status: 404 });
  return new Response(buildSecurityTxt(CONTACT_EMAIL, SITE_URL), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
