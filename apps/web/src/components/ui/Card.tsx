import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/cn";

const cornerClasses = [
  "-left-px -top-px border-l border-t",
  "-right-px -top-px border-r border-t",
  "-bottom-px -left-px border-b border-l",
  "-bottom-px -right-px border-b border-r",
];

export function Card({ className, children, ...props }: ComponentPropsWithoutRef<"div">) {
  return (
    <div className={cn("relative border border-line bg-surface p-6", className)} {...props}>
      {cornerClasses.map((corner) => (
        <span
          key={corner}
          aria-hidden="true"
          data-testid="card-corner"
          className={cn("pointer-events-none absolute size-2.5 border-muted", corner)}
        />
      ))}
      {children}
    </div>
  );
}
