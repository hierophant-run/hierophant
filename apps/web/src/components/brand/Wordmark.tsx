import type { CSSProperties } from "react";
import { cn } from "@/lib/cn";

type WordmarkProps = {
  className?: string;
  style?: CSSProperties;
};

export function Wordmark({ className, style }: WordmarkProps) {
  return (
    <span
      className={cn(
        "inline-block font-sans font-medium leading-none tracking-[-0.035em]",
        className,
      )}
      style={style}
    >
      <span className="sr-only">Hierophant</span>
      <span aria-hidden="true" className="select-none" data-testid="wordmark-visual">
        H
        <span className="relative inline-block">
          ı
          <span
            className="absolute top-[0.145em] left-[calc(50%+0.0175em)] size-[0.135em] -translate-x-1/2 rounded-full"
            style={{ backgroundColor: "var(--logo-dot, var(--dot))" }}
            data-testid="wordmark-dot"
          />
        </span>
        erophant
      </span>
    </span>
  );
}
