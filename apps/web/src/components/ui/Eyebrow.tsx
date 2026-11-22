import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/cn";

export function Eyebrow({ className, children, ...props }: ComponentPropsWithoutRef<"p">) {
  return (
    <p
      className={cn(
        "font-mono text-xs font-normal tracking-[0.14em] text-muted uppercase",
        className,
      )}
      {...props}
    >
      {children}
    </p>
  );
}
