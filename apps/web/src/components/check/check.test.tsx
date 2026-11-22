import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CheckResult } from "@/server/checks";
import { checkPath, targetFromInput } from "@/lib/check-target";
import { CheckDocument } from "./CheckDocument";
import { CheckPanel } from "./CheckPanel";

const result = (overrides: Partial<CheckResult> = {}): CheckResult => ({
  target: { kind: "token", chain: "base", address: `0x${"a".repeat(40)}` },
  kindLabel: "Base token metadata",
  name: "Example Token (TKN)",
  subtitle: `0x${"a".repeat(40)}`,
  sourceUrl: `https://basescan.org/token/0x${"a".repeat(40)}`,
  status: "no_issues_found",
  statusLabel: "No injection found",
  rulesetVersion: "0.3.0",
  checkedAt: "2026-11-23T08:30:00.000Z",
  signals: [],
  checked: ["On-chain token name and symbol"],
  notChecked: ["Whether the token can be sold"],
  notice: "This checks on-chain text only. It is not a safety rating, audit, or investment advice.",
  ...overrides,
});

describe("CheckDocument", () => {
  it("shows what a token check does not cover", () => {
    render(<CheckDocument result={result()} />);
    expect(screen.getByText("No injection found")).toBeTruthy();
    expect(screen.getByText(/not a safety rating, audit, or investment advice/)).toBeTruthy();
    expect(screen.getByText("Whether the token can be sold")).toBeTruthy();
    expect(screen.getByAltText("Token metadata: No injection found")).toBeTruthy();
  });

  it("shows token evidence and labels market data as context", () => {
    render(
      <CheckDocument
        result={result({
          tokenDetails: {
            text: [{ label: "Name", value: "Example Token" }],
            inspections: [{ label: "Hidden characters", isFound: false }],
            market: [{ label: "Holders", value: "1,234", note: "Reported by GeckoTerminal." }],
          },
        })}
      />,
    );
    expect(screen.getByRole("heading", { name: "What was read" })).toBeTruthy();
    expect(screen.getByText("None found")).toBeTruthy();
    expect(screen.getByText("1,234")).toBeTruthy();
    expect(screen.getByText(/not a safety rating or buy\s+signal/)).toBeTruthy();
  });

  it("renders hostile remote text as plain text", () => {
    const payload = '<img src=x onerror="window.__xss=1">';
    const { container } = render(
      <CheckDocument
        result={result({
          name: payload,
          subtitle: payload,
          signals: [{ severity: "high", title: payload, detail: payload, location: payload }],
        })}
      />,
    );
    expect(container.querySelector('img[src="x"]')).toBeNull();
    expect(container.textContent).toContain("<img src=x");
    expect((window as unknown as { __xss?: number }).__xss).toBeUndefined();
  });

  it("opens external links without passing page context", () => {
    const { container } = render(
      <CheckDocument
        result={result({
          signals: [
            { severity: "critical", title: "t", detail: "d", href: "https://osv.dev/x" },
            { severity: "high", title: "u", detail: "d", location: "f:1", href: "https://x.dev" },
          ],
        })}
      />,
    );
    const links = [...container.querySelectorAll('a[target="_blank"]')];
    expect(links.length).toBeGreaterThanOrEqual(3);
    for (const link of links) expect(link.getAttribute("rel")).toContain("noopener");
  });
});

describe("CheckPanel", () => {
  const field = (name: string) => screen.getByLabelText(name) as HTMLInputElement;

  beforeEach(() => {
    window.history.replaceState(null, "", "/");
    vi.stubGlobal("scrollTo", vi.fn());
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ matches: true })),
    );
  });

  it("starts on repositories", () => {
    render(<CheckPanel />);
    expect(field("Public GitHub repository URL")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Repo" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("switches between every check type", () => {
    render(<CheckPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Package" }));
    expect(field("Package name")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "MCP" }));
    expect(field("MCP Registry server name")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Skill" }));
    expect(field("GitHub URL of the skill folder")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Token" }));
    expect(field("Token address")).toBeTruthy();
    expect(screen.getByLabelText("Blockchain")).toBeTruthy();
    expect(screen.getByText(/Not a safety rating or investment advice/)).toBeTruthy();
    expect(window.location.hash).toBe("#check-token");
  });

  it("opens the tab named in the URL", () => {
    window.history.replaceState(null, "", "/#check-mcp");
    render(<CheckPanel />);
    expect(field("MCP Registry server name")).toBeTruthy();
  });

  it("ignores an unknown hash", () => {
    window.history.replaceState(null, "", "/#check-constructor");
    render(<CheckPanel />);
    expect(field("Public GitHub repository URL")).toBeTruthy();
  });

  it("rejects an invalid token address", () => {
    render(<CheckPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Token" }));
    fireEvent.change(field("Token address"), { target: { value: "0x123" } });
    fireEvent.click(screen.getByRole("button", { name: "Check" }));
    expect(screen.getByRole("alert").textContent).toContain("valid token address");
  });

  it("offers Robinhood Chain and keeps the address field general", () => {
    render(<CheckPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Token" }));
    expect(screen.getByRole("option", { name: "Robinhood" })).toBeTruthy();
    expect(field("Token address").placeholder).toBe("Token address");
    const target = targetFromInput({
      type: "token",
      value: `0x${"A".repeat(40)}`,
      ecosystem: "npm",
      chain: "robinhood",
    });
    expect(target && checkPath(target)).toBe(`/check/token/robinhood/0x${"a".repeat(40)}`);
  });

  it("stays on the repo form while a scan is running", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})),
    );
    render(<CheckPanel />);
    fireEvent.change(field("Public GitHub repository URL"), {
      target: { value: "https://github.com/owner/repo" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Scan" }));

    await waitFor(() =>
      expect((screen.getByRole("button", { name: "Token" }) as HTMLButtonElement).disabled).toBe(
        true,
      ),
    );
    window.location.hash = "#check-token";
    await waitFor(() => expect(window.location.hash).toBe("#check-repo"));
    expect(field("Public GitHub repository URL")).toBeTruthy();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });
});
