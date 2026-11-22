import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { CheckResult } from "@/server/checks";
import { CheckDocument } from "./CheckDocument";
import { CheckForm } from "./CheckForm";

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

describe("CheckForm", () => {
  const field = (name: string) => screen.getByLabelText(name) as HTMLInputElement;

  it("switches between check types", () => {
    render(<CheckForm />);
    expect(field("Package name")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "MCP server" }));
    expect(field("MCP Registry server name")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Agent skill" }));
    expect(field("GitHub URL of the skill folder")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Token" }));
    expect(field("Token contract or mint address")).toBeTruthy();
    expect(screen.getByLabelText("Blockchain")).toBeTruthy();
    expect(screen.getByText(/not a safety rating or investment advice/)).toBeTruthy();
  });

  it("rejects an invalid token address", () => {
    render(<CheckForm />);
    fireEvent.click(screen.getByRole("button", { name: "Token" }));
    fireEvent.change(field("Token contract or mint address"), { target: { value: "0x123" } });
    fireEvent.click(screen.getByRole("button", { name: "Check" }));
    expect(screen.getByRole("alert").textContent).toContain("valid token address");
  });
});
