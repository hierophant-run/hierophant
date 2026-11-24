"use client";

import { useEffect, type MouseEvent, type ReactNode } from "react";
import { siteHref } from "@/lib/site";

function clearHash() {
  const { pathname, search, hash } = window.location;
  if (!hash) return;
  window.history.replaceState(null, "", `${pathname}${search}`);
  window.dispatchEvent(new HashChangeEvent("hashchange"));
}

function goToTop(event: MouseEvent<HTMLAnchorElement>) {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
    return;
  }
  const url = new URL(event.currentTarget.href);
  if (url.origin !== window.location.origin || url.pathname !== window.location.pathname) return;
  event.preventDefault();
  clearHash();
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
}

export function HomeLink({ children, className }: { children: ReactNode; className: string }) {
  // Links shared before this change can still carry the old anchor.
  useEffect(() => {
    const removeOldAnchor = () => {
      if (window.location.hash === "#top") clearHash();
    };
    removeOldAnchor();
    window.addEventListener("hashchange", removeOldAnchor);
    return () => window.removeEventListener("hashchange", removeOldAnchor);
  }, []);

  return (
    <a href={siteHref("/")} onClick={goToTop} className={className}>
      {children}
    </a>
  );
}
