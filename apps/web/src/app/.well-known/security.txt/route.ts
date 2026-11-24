import { CONTACT_EMAIL, SITE_URL } from "@/lib/site";
import { buildSecurityTxt } from "@/server/security-txt";

export function GET() {
  return new Response(buildSecurityTxt(SITE_URL, CONTACT_EMAIL), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
