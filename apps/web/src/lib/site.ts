const EMAIL = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(
  /\/+$/,
  "",
);

export const GITHUB_URL = "https://github.com/hierophant-run/hierophant";

const DOCS_ORIGIN = (process.env.NEXT_PUBLIC_DOCS_URL ?? "").replace(/\/+$/, "");

/** A docs page. Production serves docs from their own subdomain. */
export const docsHref = (path = "") =>
  DOCS_ORIGIN ? `${DOCS_ORIGIN}${path || "/"}` : `/docs${path}`;

/** A main-site page, which must stay absolute when it is linked from the docs subdomain. */
export const siteHref = (path: string) => (DOCS_ORIGIN ? `${SITE_URL}${path}` : path);

/** Cloudflare Turnstile stays off until a site key is configured. */
export const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() || null;

const contact = process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim() ?? "";

/** Public contact for security reports and report removal. Null until the owner sets one. */
export const CONTACT_EMAIL = EMAIL.test(contact) ? contact : null;
