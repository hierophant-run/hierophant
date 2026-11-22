import type { ReportView } from "@/server/report-view";

const storageKey = (reportId: string) => `hierophant:excerpts:${reportId}`;

export const excerptKey = (finding: { ruleId: string; path: string; line: number }) =>
  `${finding.ruleId}:${finding.path}:${finding.line}`;

/**
 * Keeps redacted excerpts from a fresh scan in this browser tab only.
 * The server never stores them, so a shared report link does not include them.
 */
export function saveExcerpts(report: ReportView): void {
  const excerpts: Record<string, string> = {};
  for (const finding of report.findings) {
    if (finding.excerpt) excerpts[excerptKey(finding)] = finding.excerpt;
  }
  if (Object.keys(excerpts).length === 0) return;

  try {
    window.sessionStorage.setItem(storageKey(report.id), JSON.stringify(excerpts));
  } catch {
    // Excerpts are optional, and storage can be unavailable in private windows.
  }
}

export function readExcerpt(reportId: string, key: string): string | null {
  try {
    const stored = window.sessionStorage.getItem(storageKey(reportId));
    if (!stored) return null;
    const value = (JSON.parse(stored) as Record<string, unknown>)[key];
    return typeof value === "string" ? value : null;
  } catch {
    return null;
  }
}
