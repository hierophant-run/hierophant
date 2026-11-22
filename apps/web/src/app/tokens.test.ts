import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");

type Rgb = [number, number, number];

function token(name: string): Rgb {
  const match = css.match(new RegExp(`--${name}:\\s*#([0-9a-f]{6});`, "i"));
  if (!match?.[1]) throw new Error(`Missing token --${name}`);
  const hex = match[1];
  return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb;
}

function blend(foreground: Rgb, background: Rgb, alpha: number): Rgb {
  return foreground.map((value, i) => value * alpha + background[i]! * (1 - alpha)) as Rgb;
}

function luminance(color: Rgb): number {
  const [r, g, b] = color.map((value) => {
    const channel = value / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  }) as Rgb;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: Rgb, b: Rgb): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (light + 0.05) / (dark + 0.05);
}

const AA_TEXT = 4.5;
const AA_GRAPHIC = 3;

describe("color contrast", () => {
  it.each([
    ["text", "bg"],
    ["text", "surface"],
    ["muted", "bg"],
    ["muted", "surface"],
    ["dot", "bg"],
    ["dot", "surface"],
    ["danger", "bg"],
    ["danger", "surface"],
    ["on-accent", "accent"],
    ["on-accent", "dot"],
  ])("--%s on --%s meets AA for text", (foreground, background) => {
    expect(contrast(token(foreground), token(background))).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it.each(["bg", "surface"])("status tints on --%s keep AA text contrast", (background) => {
    const ground = token(background);
    for (const name of ["danger", "dot"]) {
      const tint = blend(token(name), ground, 0.1);
      expect(contrast(token(name), tint)).toBeGreaterThanOrEqual(AA_TEXT);
      expect(contrast(token("muted"), tint)).toBeGreaterThanOrEqual(AA_TEXT);
    }
  });

  it("logo dot on cream meets AA for graphics", () => {
    expect(contrast(token("dot-on-light"), token("accent"))).toBeGreaterThanOrEqual(AA_GRAPHIC);
  });
});
