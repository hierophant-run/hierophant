"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";

export function CopyField({ value, label }: { value: string; label: string }) {
  const [state, setState] = useState<"idle" | "copied" | "selected">("idle");
  const code = useRef<HTMLElement>(null);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setState("copied");
    } catch {
      const selection = window.getSelection();
      if (code.current && selection) {
        const range = document.createRange();
        range.selectNodeContents(code.current);
        selection.removeAllRanges();
        selection.addRange(range);
      }
      setState("selected");
    }
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setState("idle"), 2200);
  };

  return (
    <div className="mt-4 flex min-w-0 flex-col gap-2 sm:flex-row sm:items-stretch">
      <code
        ref={code}
        className="flex min-h-11 min-w-0 flex-1 items-center border border-line bg-bg/70 px-3 py-2 font-mono text-xs break-all text-text sm:text-sm"
      >
        {value}
      </code>
      <Button variant="secondary" onClick={copy} className="min-h-11 shrink-0">
        <span aria-live="polite">
          {state === "copied" ? "Copied" : state === "selected" ? "Selected" : label}
        </span>
      </Button>
    </div>
  );
}
