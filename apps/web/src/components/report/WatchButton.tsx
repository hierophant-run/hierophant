"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";

export function WatchButton({ reportId }: { reportId: string }) {
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const watch = async () => {
    setIsBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/watch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reportId }),
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
    <div className="mt-5">
      <Button onClick={watch} disabled={isBusy}>
        {isBusy ? "Starting" : "Watch this repo"}
      </Button>
      {error ? (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
