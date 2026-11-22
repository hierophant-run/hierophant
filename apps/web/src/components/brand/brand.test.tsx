import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Logo } from "./Logo";
import { LOGO_PATHS } from "./logo-paths";
import { LogoMark } from "./LogoMark";
import { Wordmark } from "./Wordmark";

describe("LogoMark", () => {
  it.each([16, 24, 32])("uses the small drawing at %ipx", (size) => {
    const { container } = render(<LogoMark size={size} />);
    expect(container.querySelector("svg")?.dataset.drawing).toBe("small");
    expect(container.querySelector("path")?.getAttribute("d")).toBe(LOGO_PATHS.small.blades);
  });

  it.each([33, 40, 96])("uses the standard drawing at %ipx", (size) => {
    const { container } = render(<LogoMark size={size} />);
    expect(container.querySelector("svg")?.dataset.drawing).toBe("standard");
    expect(container.querySelector("path")?.getAttribute("d")).toBe(LOGO_PATHS.standard.blades);
  });

  it("is hidden from assistive technology when decorative", () => {
    const { container } = render(<LogoMark />);
    expect(container.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("exposes an accessible name when titled", () => {
    render(<LogoMark title="Hierophant" />);
    expect(screen.getByRole("img", { name: "Hierophant" })).toBeTruthy();
  });
});

describe("Wordmark", () => {
  it("keeps the real word available to screen readers", () => {
    const { container } = render(<Wordmark />);
    expect(container.querySelector(".sr-only")?.textContent).toBe("Hierophant");
    expect(screen.getByTestId("wordmark-visual").getAttribute("aria-hidden")).toBe("true");
  });

  it("colors the dot of the i with the logo dot token", () => {
    render(<Wordmark />);
    expect(screen.getByTestId("wordmark-dot").style.backgroundColor).toContain("--logo-dot");
  });
});

describe("Logo", () => {
  it("switches the dot token in the light variant", () => {
    const { container } = render(<Logo variant="light" />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.style.getPropertyValue("--logo-dot")).toBe("var(--dot-on-light)");
    expect(root.className).toContain("text-on-accent");
  });

  it("uses the text color in the dark variant", () => {
    const { container } = render(<Logo variant="dark" />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.style.getPropertyValue("--logo-dot")).toBe("");
    expect(root.className).toContain("text-text");
  });
});
