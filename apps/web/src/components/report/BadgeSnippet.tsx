"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";

type CopyState = "idle" | "copied" | "failed";

const LABELS: Record<CopyState, string> = {
  idle: "Copy Markdown",
  copied: "Markdown copied",
  failed: "Copy failed",
};

export function BadgeSnippet({
  badgeSrc,
  markdown,
  alt,
}: {
  badgeSrc: string;
  markdown: string;
  alt: string;
}) {
  const [state, setState] = useState<CopyState>("idle");
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(markdown);
      setState("copied");
    } catch {
      setState("failed");
    }
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setState("idle"), 2200);
  };

  return (
    <div className="mt-4 min-w-0 border border-line p-4 sm:p-5">
      {/* The badge is a small SVG from this site, so image optimization adds nothing. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={badgeSrc} alt={alt} height={20} className="h-5 w-auto max-w-full" />
      <pre className="mt-4 border border-line bg-bg/70 px-3 py-2 font-mono text-xs leading-5 break-all whitespace-pre-wrap text-muted">
        <code>{markdown}</code>
      </pre>
      <Button variant="secondary" onClick={copy} className="mt-3">
        <span aria-live="polite">{LABELS[state]}</span>
      </Button>
    </div>
  );
}
