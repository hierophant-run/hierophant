"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";

const URL_PATTERN = /^https:\/\/github\.com\/[A-Za-z0-9-]+\/[A-Za-z0-9._-]+\/?$/;

/** Starts watching a public repository from its URL. */
export function WatchForm() {
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = url.trim();
    if (!URL_PATTERN.test(value)) {
      setError("Enter a public GitHub repository URL, like https://github.com/owner/repo.");
      return;
    }
    setError(null);
    setIsBusy(true);
    try {
      const response = await fetch("/api/watch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: value }),
      });
      const body = (await response.json()) as { path?: string; error?: { message?: string } };
      if (!response.ok || !body.path?.startsWith("/w/")) {
        throw new Error(body.error?.message ?? "This repository could not be watched.");
      }
      // A full page load gives the watch page its own strict Content-Security-Policy.
      window.location.assign(body.path);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "This repository could not be watched.");
      setIsBusy(false);
    }
  };

  return (
    <div className="w-full">
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-2 sm:flex-row">
        <label htmlFor="check-value" className="sr-only">
          Public GitHub repository URL to watch
        </label>
        <input
          id="check-value"
          type="text"
          inputMode="url"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          value={url}
          onChange={(event) => {
            setUrl(event.target.value);
            if (error) setError(null);
          }}
          placeholder="https://github.com/owner/repo"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "watch-error" : "watch-help"}
          className="min-h-12 min-w-0 flex-1 rounded-[3px] border border-line bg-surface/90 px-3.5 font-mono text-base text-text placeholder:text-muted focus:border-muted sm:text-sm"
        />
        <Button type="submit" disabled={isBusy} className="min-h-12 w-full sm:w-28">
          {isBusy ? "Starting" : "Watch"}
        </Button>
      </form>
      {error ? (
        <p id="watch-error" role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      ) : (
        <p id="watch-help" className="mt-2 text-xs leading-5 text-muted">
          Get a feed entry whenever its agent files change. To watch an MCP server or skill, check
          it first.
        </p>
      )}
    </div>
  );
}
