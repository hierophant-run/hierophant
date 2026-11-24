import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TokenView } from "@/components/token/TokenView";
import { isEvmAddress, isHttpsUrl, TOKEN_LAUNCH, type TokenLaunch } from "@/lib/token-launch";

const xLink = () =>
  screen.getAllByRole("link", { name: "@hierophanthqcom" }).find((item) => item.closest("dd"));

const example: TokenLaunch = {
  address: `0x${"ab".repeat(20)}`,
  network: "Example Chain",
  explorerUrl: `https://explorer.example/token/0x${"ab".repeat(20)}`,
  launchUrl: "https://launch.example/token",
  launchLabel: "Example launchpad",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("token page", () => {
  it("says the token has not launched and names the official source", () => {
    const { container } = render(<TokenView launch={null} />);
    expect(screen.getByRole("heading", { level: 1, name: "$HIEROPHANT" })).toBeTruthy();
    expect(screen.getByText("Coming soon.")).toBeTruthy();
    expect(screen.getByText("Not launched")).toBeTruthy();
    expect(screen.getByText("Not available yet")).toBeTruthy();
    expect(container.textContent).toContain("Any token using this name today is not ours");
    expect(xLink()?.getAttribute("href")).toBe("https://x.com/hierophanthqcom");
    expect(xLink()?.getAttribute("rel")).toContain("noopener");
  });

  it("does not promote the token", () => {
    for (const launch of [null, example]) {
      const { container, unmount } = render(<TokenView launch={launch} />);
      const main = container.querySelector("section")?.textContent ?? "";
      expect(main).not.toMatch(/\b(?:buy|presale|airdrop|profit|returns?|moon|guaranteed)\b/i);
      expect(main).toContain("Nothing on this page is investment advice.");
      unmount();
    }
  });

  it("shows the official contract once launched", () => {
    const { container } = render(<TokenView launch={example} />);
    expect(screen.getByText("Live on Example Chain.")).toBeTruthy();
    expect(screen.getByText(example.address)).toBeTruthy();
    expect(container.textContent).toContain("This is the only official $HIEROPHANT contract");
    expect(container.textContent).toContain("has no utility");
    expect(container.textContent).not.toContain("Coming soon");
    for (const name of ["View the contract", "Example launchpad"]) {
      const link = screen.getByRole("link", { name });
      expect(link.getAttribute("rel")).toContain("noopener");
      expect(link.getAttribute("target")).toBe("_blank");
    }
  });

  it("copies the contract address", async () => {
    const writeText = vi.fn(async () => {});
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    render(<TokenView launch={example} />);
    fireEvent.click(screen.getByRole("button", { name: "Copy address" }));
    expect(await screen.findByText("Address copied")).toBeTruthy();
    expect(writeText).toHaveBeenCalledWith(example.address);
  });

  it("has a valid launch configuration", () => {
    if (!TOKEN_LAUNCH) return;
    expect(isEvmAddress(TOKEN_LAUNCH.address)).toBe(true);
    expect(isHttpsUrl(TOKEN_LAUNCH.explorerUrl)).toBe(true);
    expect(TOKEN_LAUNCH.explorerUrl.toLowerCase()).toContain(TOKEN_LAUNCH.address.toLowerCase());
    if (TOKEN_LAUNCH.launchUrl) expect(isHttpsUrl(TOKEN_LAUNCH.launchUrl)).toBe(true);
  });
});
