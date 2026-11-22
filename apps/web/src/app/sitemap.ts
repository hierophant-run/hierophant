import type { MetadataRoute } from "next";
import { docsHref, SITE_URL } from "@/lib/site";

// Reports are left out because they are noindex.
const SITE_PATHS = ["", "/report-policy", "/privacy", "/terms"];
const DOCS_PATHS = ["", "/how-it-works", "/rules", "/limitations", "/false-positives"];

const absolute = (href: string) => (href.startsWith("http") ? href : `${SITE_URL}${href}`);

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    ...SITE_PATHS.map((path) => ({ url: `${SITE_URL}${path}` })),
    ...DOCS_PATHS.map((path) => ({ url: absolute(docsHref(path)) })),
  ];
}
