"use client";

import { useEffect, useState } from "react";

const WORDS = ["Hidden hooks.", "Poisoned rules.", "Auto-run tasks."];

export function RotatingWord() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % WORDS.length);
    }, 2400);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <p className="mt-3 min-h-[1.25em] text-2xl font-medium tracking-tight text-accent sm:text-3xl">
      <span className="sr-only">Finds hidden hooks, poisoned rules, and auto-run tasks.</span>
      <span key={index} aria-hidden="true" className="rotating-word">
        {WORDS[index]}
      </span>
    </p>
  );
}
