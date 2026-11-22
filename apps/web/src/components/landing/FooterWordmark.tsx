"use client";

import { useEffect, useRef } from "react";
import { Wordmark } from "@/components/brand/Wordmark";

export function FooterWordmark() {
  const rootRef = useRef<HTMLDivElement>(null);

  // The shimmer repaints large text, so it only runs while the footer is on screen.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    if (typeof IntersectionObserver === "undefined") {
      root.dataset.shimmer = "on";
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      root.dataset.shimmer = entry?.isIntersecting ? "on" : "off";
    });
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={rootRef}
      data-shimmer="off"
      data-testid="footer-wordmark"
      className="wordmark-shine relative inline-block text-[clamp(3.4rem,16.8vw,14rem)]"
    >
      <Wordmark className="wordmark-glow block pb-[0.1em] text-line" />
    </div>
  );
}
