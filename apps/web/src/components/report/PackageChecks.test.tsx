import type { PackageCheck } from "@hierophant/intel";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ReportView } from "@/server/report-view";
import { openingSteps } from "./guidance";
import { PackageChecks } from "./PackageChecks";

const check = (overrides: Partial<PackageCheck> = {}): PackageCheck => ({
  ecosystem: "npm",
  name: "some-tool",
  requested: null,
  version: "1.0.0",
  verdict: "no_known_issues",
  advisories: [],
  advisoryCount: 0,
  flags: [],
  createdAt: null,
  references: [{ path: ".mcp.json", line: 4 }],
  ...overrides,
});

const report = (checks: PackageCheck[], omitted = 0): ReportView => ({
  id: "C".repeat(22),
  repository: { owner: "acme", name: "app", url: "https://github.com/acme/app" },
  commit: { sha: "a".repeat(40), shortSha: "aaaaaaa", url: "https://github.com/acme/app/commit/a" },
  scannedAt: "2026-11-22T00:00:00.000Z",
  rulesetVersion: "0.3.0",
  status: "needs_review",
  filesScanned: 1,
  noAgentFiles: false,
  impact: [],
  findings: [],
  skipped: [],
  packages: { checkedAt: "2026-11-22T08:30:00.000Z", omitted, checks },
  disclaimer: "These are automated review signals from static checks. They are not a guarantee.",
});

describe("PackageChecks", () => {
  it("renders nothing without packages", () => {
    const { container } = render(<PackageChecks report={{ ...report([]), packages: null }} />);
    expect(container.textContent).toBe("");
  });

  it("shows the version, verdict, source, and check time", () => {
    render(<PackageChecks report={report([check()])} />);
    expect(screen.getByRole("link", { name: "some-tool@1.0.0" }).getAttribute("href")).toBe(
      "https://www.npmjs.com/package/some-tool",
    );
    expect(screen.getByText("No known issues")).toBeTruthy();
    expect(screen.getByRole("link", { name: ".mcp.json:4" }).getAttribute("href")).toBe(
      `https://github.com/acme/app/blob/${"a".repeat(40)}/.mcp.json#L4`,
    );
    expect(screen.getByText(/Nov 22, 2026, 8:30 AM UTC/)).toBeTruthy();
    expect(screen.getByText(/does not mean a\s+package is harmless/)).toBeTruthy();
  });

  it("links advisories and counts the rest", () => {
    render(
      <PackageChecks
        report={report([
          check({ verdict: "malicious", advisories: ["MAL-2026-1"], advisoryCount: 3 }),
        ])}
      />,
    );
    expect(screen.getByText("Listed as malicious")).toBeTruthy();
    expect(screen.getByRole("link", { name: "MAL-2026-1" }).getAttribute("href")).toBe(
      "https://osv.dev/vulnerability/MAL-2026-1",
    );
    expect(screen.getByText(/and 2 more/)).toBeTruthy();
  });

  it("states when a package could not be checked", () => {
    render(<PackageChecks report={report([check({ verdict: "unavailable", version: null })])} />);
    expect(screen.getByText("Could not be checked")).toBeTruthy();
  });

  it("shows flags and omitted packages", () => {
    render(
      <PackageChecks report={report([check({ flags: ["install_script", "deprecated"] })], 4)} />,
    );
    expect(screen.getByText(/Runs an install script · Deprecated/)).toBeTruthy();
    expect(screen.getByText(/4 more packages were not checked/)).toBeTruthy();
  });

  it("renders hostile values as text", () => {
    const payload = '<img src=x onerror="window.__xss=1">';
    const { container } = render(
      <PackageChecks
        report={report([check({ name: payload, references: [{ path: payload, line: 1 }] })])}
      />,
    );
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toContain("<img src=x");
  });

  it("opens external links without passing page context", () => {
    const { container } = render(
      <PackageChecks report={report([check({ advisories: ["GHSA-x"], advisoryCount: 1 })])} />,
    );
    const links = [...container.querySelectorAll("a")];
    expect(links.length).toBe(3);
    for (const link of links) expect(link.getAttribute("rel")).toContain("noopener");
  });
});

describe("opening guidance", () => {
  it("mentions flagged packages", () => {
    const titles = openingSteps(report([check({ verdict: "not_found" })])).map((s) => s.title);
    expect(titles).toContain("Review the listed packages");
  });

  it("stays quiet for packages with no known issues", () => {
    const titles = openingSteps(report([check()])).map((s) => s.title);
    expect(titles).not.toContain("Review the listed packages");
  });
});
