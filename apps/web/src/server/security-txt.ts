/** RFC 9116 requires an expiry. Renew this before it passes. */
export const SECURITY_TXT_EXPIRES = "2027-05-22T00:00:00.000Z";

/** Private vulnerability reports go through GitHub, so no personal address is published. */
export const SECURITY_REPORT_URL =
  "https://github.com/hierophant-run/hierophant/security/advisories/new";

export function buildSecurityTxt(siteUrl: string, contactEmail?: string | null): string {
  return [
    `Contact: ${SECURITY_REPORT_URL}`,
    ...(contactEmail ? [`Contact: mailto:${contactEmail}`] : []),
    `Expires: ${SECURITY_TXT_EXPIRES}`,
    `Canonical: ${siteUrl}/.well-known/security.txt`,
    `Policy: https://github.com/hierophant-run/hierophant/security/policy`,
    "Preferred-Languages: en",
    "",
  ].join("\n");
}
