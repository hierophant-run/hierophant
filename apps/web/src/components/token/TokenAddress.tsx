"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";

type CopyState = "idle" | "copied" | "selected";

const LABELS: Record<CopyState, string> = {
  idle: "Copy address",
  copied: "Address copied",
  selected: "Address selected",
};

export function TokenAddress({ address }: { address: string }) {
  const [state, setState] = useState<CopyState>("idle");
  const code = useRef<HTMLElement>(null);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address);
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
    <div className="flex flex-col items-start gap-3">
      <code ref={code} className="font-mono text-sm break-all text-text">
        {address}
      </code>
      <Button variant="secondary" onClick={copy} className="min-h-10">
        <span aria-live="polite">{LABELS[state]}</span>
      </Button>
    </div>
  );
}
