/** RFC 9116 requires an expiry. Renew this before it passes. */
export const SECURITY_TXT_EXPIRES = "2027-05-22T00:00:00.000Z";

export function buildSecurityTxt(contactEmail: string, siteUrl: string): string {
  return [
    `Contact: mailto:${contactEmail}`,
    `Expires: ${SECURITY_TXT_EXPIRES}`,
    `Canonical: ${siteUrl}/.well-known/security.txt`,
    "Preferred-Languages: en",
    "",
  ].join("\n");
}
