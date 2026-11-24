"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";

/** Starts watching from a report or a check result, then opens the watch page. */
export function WatchStartButton({
  body,
  label = "Watch for changes",
}: {
  body: { reportId: string } | { check: string };
  label?: string;
}) {
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const watch = async () => {
    setIsBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/watch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = (await response.json()) as { path?: string; error?: { message?: string } };
      if (!response.ok || !/^\/(w|watch)\//.test(result.path ?? "")) {
        throw new Error(result.error?.message ?? "This could not be watched.");
      }
      // A full page load gives the watch page its own strict Content-Security-Policy.
      window.location.assign(result.path!);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "This could not be watched.");
      setIsBusy(false);
    }
  };

  return (
    <div className="mt-5">
      <Button onClick={watch} disabled={isBusy}>
        {isBusy ? "Starting" : label}
      </Button>
      {error ? (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
