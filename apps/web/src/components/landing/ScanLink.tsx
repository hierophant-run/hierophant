"use client";

import type { MouseEvent, ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { siteHref } from "@/lib/site";

const FOCUS_TIMEOUT_MS = 2500;

function focusScanInput() {
  const input = document.getElementById("scan-url");
  if (!input) return;
  const hero = input.closest("[data-stage-hero]") ?? input;
  const startedAt = performance.now();

  // The form fades out during the scroll animation, so wait until it is back on screen.
  const attempt = () => {
    const style = getComputedStyle(hero);
    if (window.scrollY < 2 && style.visibility !== "hidden" && Number(style.opacity) > 0.5) {
      input.focus({ preventScroll: true });
    } else if (performance.now() - startedAt < FOCUS_TIMEOUT_MS) {
      requestAnimationFrame(attempt);
    }
  };
  attempt();
}

function goToScan(event: MouseEvent<HTMLAnchorElement>) {
  // Other pages have no form, so the link navigates to the home page normally.
  if (!document.getElementById("scan-url")) return;
  event.preventDefault();
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
  focusScanInput();
}

export function ScanLink({
  children,
  className,
  plain = false,
}: {
  children: ReactNode;
  className?: string;
  plain?: boolean;
}) {
  if (plain) {
    return (
      <a href={siteHref("/#scan-url")} onClick={goToScan} className={className}>
        {children}
      </a>
    );
  }
  return (
    <Button href={siteHref("/#scan-url")} onClick={goToScan} {...(className ? { className } : {})}>
      {children}
    </Button>
  );
}
