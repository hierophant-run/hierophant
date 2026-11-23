import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import TokenPage from "./page";

describe("token page", () => {
  it("says the token has not launched and names the official source", () => {
    const { container } = render(<TokenPage />);
    expect(screen.getByRole("heading", { level: 1, name: "$HIEROPHANT" })).toBeTruthy();
    expect(screen.getByText("Coming soon.")).toBeTruthy();
    expect(screen.getByText("Not launched")).toBeTruthy();
    expect(screen.getByText("Not available yet")).toBeTruthy();
    expect(container.textContent).toContain("Any token using this name today is not ours");
    const link = screen
      .getAllByRole("link", { name: "@hierophanthqcom" })
      .find((item) => item.closest("dd"));
    expect(link?.getAttribute("href")).toBe("https://x.com/hierophanthqcom");
    expect(link?.getAttribute("rel")).toContain("noopener");
  });

  it("does not promote the token", () => {
    const { container } = render(<TokenPage />);
    const main = container.querySelector("section")?.textContent ?? "";
    expect(main).not.toMatch(
      /\b(?:buy|presale|airdrop|profit|returns?|moon|guaranteed|utility)\b/i,
    );
    expect(main).toContain("Nothing on this page is investment advice.");
  });
});
