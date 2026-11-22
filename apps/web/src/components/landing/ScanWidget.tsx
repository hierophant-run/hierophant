"use client";

import { useState } from "react";
import { LogoMark } from "@/components/brand/LogoMark";
import { StatusBadge } from "@/components/ui/StatusBadge";

export function ScanWidget() {
  const [isOpen, setIsOpen] = useState(true);
  if (!isOpen) return null;

  return (
    <aside
      aria-label="Example scan result"
      data-testid="scan-widget"
      className="absolute right-5 bottom-5 z-30 hidden w-72 border border-line bg-surface/95 p-4 backdrop-blur-md lg:block"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 font-mono text-xs tracking-[0.14em] text-muted uppercase">
          <LogoMark size={18} />
          Example
        </span>
        <button
          type="button"
          onClick={() => setIsOpen(false)}
          aria-label="Dismiss example scan"
          className="-m-2 flex size-9 items-center justify-center text-muted transition-colors hover:text-text"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="m2 2 8 8M10 2l-8 8" />
          </svg>
        </button>
      </div>
      <p className="mt-3 truncate font-mono text-sm text-text">acme/example-repo</p>
      <p className="mt-1 text-xs text-muted">Session hook found in .claude/settings.json</p>
      <div className="mt-3">
        <StatusBadge status="needs_review" />
      </div>
    </aside>
  );
}
