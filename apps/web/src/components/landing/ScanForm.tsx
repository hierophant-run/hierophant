"use client";

import { useRef, useState, type FormEvent } from "react";
import { saveExcerpts } from "@/components/report/excerpt-store";
import { goToReport } from "@/components/report/navigation";
import { Button } from "@/components/ui/Button";
import { TURNSTILE_SITE_KEY } from "@/lib/site";
import { ApiError } from "@/server/errors";
import { parseGitHubUrl } from "@/server/github-url";
import type { ReportView } from "@/server/report-view";
import type { ScanProgress } from "@/server/scan-progress";
import { loadTurnstile, requestTurnstileToken } from "./turnstile";

const REQUEST_TIMEOUT_MS = 35_000;
const GENERIC_ERROR = "The scan could not be completed. Please try again.";
const VERIFICATION_ERROR = "We could not verify this request. Please try again.";

type StreamEvent =
  | ({ type: "progress" } & ScanProgress)
  | { type: "result"; report: ReportView }
  | { type: "error"; error?: { message?: string } };

/** An error whose message came from our API and is written for the visitor. */
class ScanFailure extends Error {}

function validationMessage(value: string): string | null {
  try {
    parseGitHubUrl(value);
    return null;
  } catch (error) {
    return error instanceof ApiError ? error.message : GENERIC_ERROR;
  }
}

function describeProgress(progress: ScanProgress): { label: string; percent: number } {
  switch (progress.stage) {
    case "repository":
      return { label: "Finding the repository", percent: 10 };
    case "listing":
      return { label: "Listing files", percent: 25 };
    case "downloading": {
      const share = progress.total > 0 ? progress.done / progress.total : 1;
      return {
        label: `Reading agent files, ${progress.done} of ${progress.total}`,
        percent: Math.round(30 + share * 50),
      };
    }
    case "scanning":
      return { label: "Running detection rules", percent: 84 };
    case "packages":
      return { label: "Checking packages", percent: 90 };
    case "saving":
      return { label: "Saving the report", percent: 96 };
  }
}

async function readEvents(
  body: ReadableStream<Uint8Array>,
  onProgress: (progress: ScanProgress) => void,
): Promise<ReportView> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  for (;;) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.trim()) continue;
      const event = JSON.parse(line) as StreamEvent;
      if (event.type === "result") return event.report;
      if (event.type === "error") throw new ScanFailure(event.error?.message ?? GENERIC_ERROR);
      onProgress(event);
    }
    if (done) throw new ScanFailure(GENERIC_ERROR);
  }
}

async function requestScan(
  url: string,
  turnstileToken: string | null,
  onProgress: (progress: ScanProgress) => void,
): Promise<ReportView> {
  const response = await fetch("/api/scan", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/x-ndjson" },
    body: JSON.stringify(turnstileToken ? { url, turnstileToken } : { url }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (response.headers.get("content-type")?.includes("ndjson") && response.body) {
    return readEvents(response.body, onProgress);
  }
  const body = (await response.json()) as {
    report?: ReportView;
    error?: { message?: string };
  };
  if (!response.ok || !body.report) throw new ScanFailure(body.error?.message ?? GENERIC_ERROR);
  return body.report;
}

export function ScanForm({ onBusyChange }: { onBusyChange?: (busy: boolean) => void }) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isScanning, setScanning] = useState(false);
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  const challenge = useRef<HTMLDivElement>(null);

  const setIsScanning = (busy: boolean) => {
    setScanning(busy);
    onBusyChange?.(busy);
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isScanning) return;

    const problem = validationMessage(url);
    setError(problem);
    if (problem) return;

    setIsScanning(true);
    let turnstileToken: string | null = null;
    if (TURNSTILE_SITE_KEY && challenge.current) {
      try {
        turnstileToken = await requestTurnstileToken(TURNSTILE_SITE_KEY, challenge.current);
      } catch {
        setError(VERIFICATION_ERROR);
        setIsScanning(false);
        return;
      }
    }

    setProgress({ stage: "repository" });
    try {
      const report = await requestScan(url.trim(), turnstileToken, setProgress);
      saveExcerpts(report);
      // The button stays busy until the report page replaces this one.
      goToReport(report.id);
    } catch (requestError) {
      setError(requestError instanceof ScanFailure ? requestError.message : GENERIC_ERROR);
      setIsScanning(false);
      setProgress(null);
    }
  };

  const status = progress ? describeProgress(progress) : null;

  return (
    <div className="w-full">
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-2 sm:flex-row">
        <label htmlFor="scan-url" className="sr-only">
          Public GitHub repository URL
        </label>
        <input
          id="scan-url"
          name="url"
          type="text"
          inputMode="url"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          value={url}
          onFocus={() => {
            if (TURNSTILE_SITE_KEY) loadTurnstile().catch(() => {});
          }}
          onChange={(event) => {
            setUrl(event.target.value);
            if (error) setError(null);
          }}
          placeholder="https://github.com/owner/repo"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "scan-error" : undefined}
          className="min-h-12 w-full min-w-0 flex-1 rounded-[3px] border border-line bg-surface/90 px-3.5 font-mono text-base text-text placeholder:text-muted focus:border-muted sm:text-sm"
        />
        <Button
          type="submit"
          disabled={isScanning}
          className={`min-h-12 sm:w-28 ${isScanning ? "scan-progress" : ""}`}
        >
          {isScanning ? "Scanning" : "Scan"}
        </Button>
      </form>
      {TURNSTILE_SITE_KEY ? <div ref={challenge} className="mt-2 empty:hidden" /> : null}

      {status ? (
        <div className="mt-2.5">
          <div
            role="progressbar"
            aria-label="Scan progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={status.percent}
            className="h-0.5 w-full bg-line"
          >
            <div
              className="h-full bg-dot transition-[width] duration-200"
              style={{ width: `${status.percent}%` }}
            />
          </div>
          <p role="status" className="mt-1.5 font-mono text-xs text-muted">
            {status.label}
          </p>
        </div>
      ) : error ? (
        <p id="scan-error" role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      ) : (
        <p className="mt-2 text-xs text-muted">
          Public repositories only. Nothing is cloned or executed.
        </p>
      )}
    </div>
  );
}
