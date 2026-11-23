"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { NPM_URL } from "@/lib/site";

type CopyState = "idle" | "copied" | "failed";

const COMMANDS = [
  { label: "Run once", command: "npx @hierophanthq/cli scan ." },
  { label: "Install globally", command: "npm install -g @hierophanthq/cli" },
];

const COPY_LABELS: Record<CopyState, string> = {
  idle: "Copy",
  copied: "Copied",
  failed: "Copy failed",
};

function CommandRow({ label, command }: { label: string; command: string }) {
  const [state, setState] = useState<CopyState>("idle");
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setState("copied");
    } catch {
      setState("failed");
    }
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setState("idle"), 2200);
  };

  return (
    <li className="py-5">
      <h3 className="text-sm text-muted">{label}</h3>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-stretch">
        <code className="flex min-h-11 min-w-0 flex-1 items-center border border-line bg-bg/70 px-3 py-2 font-mono text-[13px] break-all text-text sm:text-sm">
          {command}
        </code>
        <Button variant="secondary" onClick={copy} className="min-h-11 shrink-0 sm:w-32">
          <span aria-live="polite">
            {COPY_LABELS[state]}
            <span className="sr-only"> {label.toLowerCase()} command</span>
          </span>
        </Button>
      </div>
    </li>
  );
}

export function CliInstall() {
  return (
    <section
      id="cli"
      aria-labelledby="cli-title"
      className="mx-auto w-full max-w-[1240px] scroll-mt-24 px-4 sm:px-8"
    >
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16">
        <div>
          <Eyebrow>Command line</Eyebrow>
          <h2
            id="cli-title"
            className="mt-4 text-3xl leading-tight font-medium tracking-tight sm:text-5xl"
          >
            Run it from your terminal.
          </h2>
          <p className="mt-4 max-w-md leading-7 text-muted">
            Check a local folder before your agent opens it. Hierophant reads files as text and
            never runs them.
          </p>
          <p className="mt-4 text-sm text-muted">
            Needs Node.js 22.12 or later.{" "}
            <a
              href={NPM_URL}
              target="_blank"
              rel="noreferrer noopener"
              className="text-text underline underline-offset-2"
            >
              View on npm
            </a>
          </p>
        </div>
        <ul className="divide-y divide-line border-y border-line">
          {COMMANDS.map((item) => (
            <CommandRow key={item.command} {...item} />
          ))}
        </ul>
      </div>
    </section>
  );
}
