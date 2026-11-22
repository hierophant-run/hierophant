"use client";

import { useSyncExternalStore } from "react";
import { excerptKey, readExcerpt } from "./excerpt-store";

const subscribe = () => () => {};

export function FindingExcerpt({
  reportId,
  ruleId,
  path,
  line,
}: {
  reportId: string;
  ruleId: string;
  path: string;
  line: number;
}) {
  const excerpt = useSyncExternalStore(
    subscribe,
    () => readExcerpt(reportId, excerptKey({ ruleId, path, line })),
    () => null,
  );
  if (!excerpt) return null;

  return (
    <div className="mt-4 min-w-0">
      <p className="font-mono text-xs text-muted">Excerpt, visible only in this browser tab</p>
      <pre
        tabIndex={0}
        aria-label="Code excerpt"
        className="mt-1.5 overflow-x-auto border border-line bg-bg/70 px-3 py-2 font-mono text-xs leading-5 text-text"
      >
        <code>{excerpt}</code>
      </pre>
    </div>
  );
}
