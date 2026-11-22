import type { CSSProperties } from "react";
import { cn } from "@/lib/cn";
import { LogoMark } from "./LogoMark";
import { Wordmark } from "./Wordmark";

type LogoProps = {
  variant?: "dark" | "light";
  /** Height of the symbol in pixels. The wordmark scales with it. */
  size?: number;
  className?: string;
};

export function Logo({ variant = "dark", size = 40, className }: LogoProps) {
  const variantStyle =
    variant === "light" ? ({ "--logo-dot": "var(--dot-on-light)" } as CSSProperties) : undefined;

  return (
    <span
      className={cn(
        "inline-flex items-center",
        variant === "light" ? "text-on-accent" : "text-text",
        className,
      )}
      style={{ ...variantStyle, gap: size * 0.25 }}
    >
      <LogoMark size={size} />
      <Wordmark style={{ fontSize: size * 0.82 }} />
    </span>
  );
}
