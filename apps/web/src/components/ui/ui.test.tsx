import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Button } from "./Button";
import { Card } from "./Card";
import { Eyebrow } from "./Eyebrow";
import { StatusBadge } from "./StatusBadge";

describe("Button", () => {
  it("renders a non-submitting button by default", () => {
    render(<Button>Scan</Button>);
    expect(screen.getByRole("button", { name: "Scan" }).getAttribute("type")).toBe("button");
  });

  it("renders a link when href is set", () => {
    render(<Button href="/docs">Docs</Button>);
    expect(screen.getByRole("link", { name: "Docs" }).getAttribute("href")).toBe("/docs");
  });

  it("applies the requested variant", () => {
    render(<Button variant="secondary">More</Button>);
    expect(screen.getByRole("button", { name: "More" }).className).toContain("border-line");
  });
});

describe("Card", () => {
  it("renders content with four decorative corner marks", () => {
    render(<Card>Finding</Card>);
    expect(screen.getByText("Finding")).toBeTruthy();
    const corners = screen.getAllByTestId("card-corner");
    expect(corners).toHaveLength(4);
    corners.forEach((corner) => expect(corner.getAttribute("aria-hidden")).toBe("true"));
  });
});

describe("StatusBadge", () => {
  it.each([
    ["dangerous", "Dangerous", "triangle"],
    ["needs_review", "Needs review", "question"],
  ] as const)("shows text and a distinct icon for %s", (status, label, icon) => {
    const { container } = render(<StatusBadge status={status} />);
    expect(screen.getByText(label)).toBeTruthy();
    expect(container.querySelector("svg")?.getAttribute("data-icon")).toBe(icon);
  });

  it("shows the ruleset version next to a clean result", () => {
    const { container } = render(<StatusBadge status="no_issues_found" rulesetVersion="1.2.0" />);
    expect(container.textContent).toContain("No issues found");
    expect(container.textContent).toContain("ruleset v1.2.0");
    expect(container.querySelector("svg")?.getAttribute("data-icon")).toBe("lens");
  });

  it.each(["dangerous", "needs_review"] as const)("never claims %s is safe", (status) => {
    const { container } = render(<StatusBadge status={status} />);
    expect(container.textContent).not.toMatch(/safe|secure|clean/i);
  });

  it("never claims a clean result is safe", () => {
    const { container } = render(<StatusBadge status="no_issues_found" rulesetVersion="1.0.0" />);
    expect(container.textContent).not.toMatch(/safe|secure|clean/i);
  });
});

describe("Eyebrow", () => {
  it("renders its label", () => {
    render(<Eyebrow>Example</Eyebrow>);
    expect(screen.getByText("Example")).toBeTruthy();
  });
});
