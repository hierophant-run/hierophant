import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";
const TURNSTILE_ORIGIN = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim()
  ? " https://challenges.cloudflare.com"
  : "";

const BASE_HEADERS = [
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
];

// Static pages cannot carry a per-request nonce. Report pages get a stricter policy in proxy.ts.
const STATIC_PAGE_POLICY = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}${TURNSTILE_ORIGIN}`,
  `frame-src${TURNSTILE_ORIGIN || " 'none'"}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  `connect-src 'self'${isDev ? " ws:" : ""}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const CANONICAL_ORIGIN = "https://hierophanthq.com";
const ALIAS_HOSTS = ["www.hierophanthq.com", "hierophant.autora.workers.dev"];
const DOCS_HOST = "docs.hierophanthq.com";
const DOCS_ORIGIN = `https://${DOCS_HOST}`;
const isCanonicalBuild = process.env.NEXT_PUBLIC_SITE_URL === CANONICAL_ORIGIN;
const hostIs = (value: string) => [{ type: "host" as const, value }];
/** Shared files that the docs subdomain must serve from their real paths. */
const DOCS_REWRITE_SOURCE =
  "/:path((?!_next/|api/|docs(?:/|$)|icon|apple-icon|opengraph-image|robots\\.txt|sitemap\\.xml|\\.well-known/).+)";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  async redirects() {
    // Only the production build knows its final domain, so local servers are never redirected.
    if (!isCanonicalBuild) return [];
    return [
      ...ALIAS_HOSTS.map((value) => ({
        source: "/:path*",
        has: hostIs(value),
        destination: `${CANONICAL_ORIGIN}/:path*`,
        permanent: true,
      })),
      ...[new URL(CANONICAL_ORIGIN).host, DOCS_HOST].flatMap((value) => [
        { source: "/docs", has: hostIs(value), destination: `${DOCS_ORIGIN}/`, permanent: true },
        {
          source: "/docs/:path+",
          has: hostIs(value),
          destination: `${DOCS_ORIGIN}/:path+`,
          permanent: true,
        },
      ]),
    ];
  },
  async rewrites() {
    if (!isCanonicalBuild) return { beforeFiles: [], afterFiles: [], fallback: [] };
    return {
      beforeFiles: [
        { source: "/", has: hostIs(DOCS_HOST), destination: "/docs" },
        { source: DOCS_REWRITE_SOURCE, has: hostIs(DOCS_HOST), destination: "/docs/:path" },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
  async headers() {
    return [
      ...(isDev
        ? []
        : [
            {
              source: "/:path*",
              headers: [{ key: "Strict-Transport-Security", value: "max-age=31536000" }],
            },
          ]),
      { source: "/((?!api/).*)", headers: BASE_HEADERS },
      {
        source: "/((?!api/|r/|check/|w/).*)",
        headers: [{ key: "Content-Security-Policy", value: STATIC_PAGE_POLICY }],
      },
      {
        source: "/r/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
      {
        source: "/check/:path+",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
      {
        source: "/w/:path+",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
    ];
  },
};

export default nextConfig;
