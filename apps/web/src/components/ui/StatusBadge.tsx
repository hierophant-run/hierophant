import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type ScanStatus = "dangerous" | "needs_review" | "no_issues_found";

export type StatusBadgeProps =
  | { status: "dangerous" | "needs_review"; rulesetVersion?: string; className?: string }
  /** A clean result is only meaningful next to the ruleset that produced it. */
  | { status: "no_issues_found"; rulesetVersion: string; className?: string };

const iconProps = {
  width: 14,
  height: 14,
  viewBox: "0 0 16 16",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
  focusable: false,
} as const;

const statusConfig: Record<ScanStatus, { label: string; classes: string; icon: ReactNode }> = {
  dangerous: {
    label: "Dangerous",
    classes: "border-danger bg-danger/10 text-danger",
    icon: (
      <svg {...iconProps} data-icon="triangle">
        <path d="M8 2 15 14H1L8 2Z" />
        <path d="M8 6.5v3.5M8 12h.01" />
      </svg>
    ),
  },
  needs_review: {
    label: "Needs review",
    classes: "border-dot bg-dot/10 text-dot",
    icon: (
      <svg {...iconProps} data-icon="question">
        <circle cx="8" cy="8" r="6.5" />
        <path d="M6.2 6.2a1.9 1.9 0 1 1 2.9 1.6c-.7.4-1.1.8-1.1 1.6M8 11.7h.01" />
      </svg>
    ),
  },
  no_issues_found: {
    label: "No issues found",
    classes: "border-line bg-surface text-text",
    icon: (
      <svg {...iconProps} data-icon="lens">
        <circle cx="7" cy="7" r="5" />
        <path d="m11 11 3.5 3.5" />
      </svg>
    ),
  },
};

export function StatusBadge({ status, rulesetVersion, className }: StatusBadgeProps) {
  const { label, classes, icon } = statusConfig[status];

  return (
    <span
      className={cn(
        "inline-flex min-h-7 max-w-full flex-wrap items-center gap-x-1.5 gap-y-0.5 rounded-[3px] border px-2.5 py-1 text-xs font-medium",
        classes,
        className,
      )}
    >
      {icon}
      <span>{label}</span>
      {rulesetVersion ? (
        <span className="font-mono font-normal text-muted">ruleset v{rulesetVersion}</span>
      ) : null}
    </span>
  );
}
