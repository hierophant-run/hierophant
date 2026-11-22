import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    // Reports stay crawlable on purpose: a crawler must read their noindex to honor it.
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/design"] },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
