import type { ScanStatus } from "@hierophant/engine";
import { combineStatus } from "@hierophant/intel";
import { SITE_URL } from "@/lib/site";
import { ApiError } from "./errors";
import type { ScanDeps } from "./http";
import { isReportId } from "./report-store";
import { guardDatabase } from "./scan-service";

const LABEL = "Checked by Hierophant";
const CHAR_WIDTH = 6.3;
const PADDING = 16;
const HEIGHT = 20;

// Green is avoided on purpose: no status here means a repository is harmless.
const STATUS: Record<ScanStatus, { label: string; fill: string }> = {
  dangerous: { label: "Dangerous", fill: "#FF6B3D" },
  needs_review: { label: "Needs review", fill: "#F6D98B" },
  no_issues_found: { label: "No issues found", fill: "#A9BBB6" },
};

const BADGE_HEADERS = {
  "Content-Security-Policy": "default-src 'none'; sandbox",
  "Content-Type": "image/svg+xml; charset=utf-8",
  "Cross-Origin-Resource-Policy": "cross-origin",
  "X-Content-Type-Options": "nosniff",
  "X-Robots-Tag": "noindex",
};

const escapeXml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

const widthOf = (text: string) => Math.ceil(text.length * CHAR_WIDTH) + PADDING;

function drawBadge(message: string, fill: string, href?: string, label: string = LABEL): string {
  const labelWidth = widthOf(label);
  const messageWidth = widthOf(message);
  const width = labelWidth + messageWidth;
  const title = escapeXml(`${label}: ${message}`);
  const text = (value: string, x: number, color: string, length: number) =>
    `<text x="${x}" y="14" fill="${color}" textLength="${length}" lengthAdjust="spacingAndGlyphs">${escapeXml(value)}</text>`;

  const body = [
    `<rect width="${labelWidth}" height="${HEIGHT}" fill="#0B2024"/>`,
    `<rect x="${labelWidth}" width="${messageWidth}" height="${HEIGHT}" fill="${fill}"/>`,
    `<g font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">`,
    text(label, PADDING / 2, "#F2EFE4", labelWidth - PADDING),
    text(message, labelWidth + PADDING / 2, "#0A1E22", messageWidth - PADDING),
    `</g>`,
  ].join("");

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${HEIGHT}" role="img" aria-label="${title}">`,
    `<title>${title}</title>`,
    href ? `<a href="${escapeXml(href)}">${body}</a>` : body,
    `</svg>`,
  ].join("");
}

export function renderBadge(report: {
  status: ScanStatus;
  rulesetVersion: string;
  commitSha: string;
  reportUrl: string;
}): string {
  const { label, fill } = STATUS[report.status];
  const message = `${label} · v${report.rulesetVersion} · ${report.commitSha.slice(0, 7)}`;
  return drawBadge(message, fill, report.reportUrl);
}

/** Token badges say what they cover, so they cannot be read as a safety rating. */
export function renderCheckBadge(options: {
  kind: string;
  message: string;
  httpStatus: number;
  status?: ScanStatus;
  href?: string;
  maxAge?: number;
}): Response {
  const fill = options.status ? STATUS[options.status].fill : "#A9BBB6";
  const label = options.kind === "token" ? "Token metadata" : LABEL;
  return new Response(drawBadge(options.message, fill, options.href, label), {
    status: options.httpStatus,
    headers: {
      ...BADGE_HEADERS,
      "Cache-Control": options.maxAge ? `public, max-age=${options.maxAge}` : "no-store",
    },
  });
}

export const badgeAlt = (status: ScanStatus, rulesetVersion: string) =>
  `${LABEL}: ${STATUS[status].label}, ruleset v${rulesetVersion}`;

export const badgeMarkdown = (id: string, siteUrl: string = SITE_URL) =>
  `[![${LABEL}](${siteUrl}/api/badge/${id})](${siteUrl}/r/${id})`;

export async function handleBadgeRequest(
  id: string,
  getDeps: () => ScanDeps,
  siteUrl: string = SITE_URL,
): Promise<Response> {
  const failure = (message: string, status: number) =>
    new Response(drawBadge(message, "#A9BBB6"), {
      status,
      headers: { ...BADGE_HEADERS, "Cache-Control": "no-store" },
    });

  if (!isReportId(id)) return failure("Report not found", 404);
  try {
    const { store } = getDeps();
    const report = await guardDatabase(() => store.findById(id));
    if (!report) return failure("Report not found", 404);

    const svg = renderBadge({
      status: combineStatus(report.status, report.packageChecks),
      rulesetVersion: report.rulesetVersion,
      commitSha: report.commitSha,
      reportUrl: `${siteUrl}/r/${id}`,
    });
    // Kept short so a removed report stops showing soon after deletion.
    return new Response(svg, {
      status: 200,
      headers: { ...BADGE_HEADERS, "Cache-Control": "public, max-age=300" },
    });
  } catch (error) {
    return failure("Unavailable", error instanceof ApiError ? error.status : 500);
  }
}

const WATCH_LABEL = "Watched by Hierophant";

/** Shows the newest result for a watched repository, or that no result exists yet. */
export function renderWatchBadge(options: {
  status: ScanStatus | null;
  href: string;
  httpStatus?: number;
  message?: string;
}): Response {
  const message = options.message ?? (options.status ? STATUS[options.status].label : "Watching");
  const fill = options.status ? STATUS[options.status].fill : "#A9BBB6";
  return new Response(drawBadge(message, fill, options.href, WATCH_LABEL), {
    status: options.httpStatus ?? 200,
    headers: {
      ...BADGE_HEADERS,
      "Cache-Control":
        options.httpStatus && options.httpStatus !== 200 ? "no-store" : "public, max-age=900",
    },
  });
}

export const watchBadgeMarkdown = (
  badgePath: string,
  pagePath: string,
  siteUrl: string = SITE_URL,
) => `[![${WATCH_LABEL}](${siteUrl}${badgePath})](${siteUrl}${pagePath})`;
