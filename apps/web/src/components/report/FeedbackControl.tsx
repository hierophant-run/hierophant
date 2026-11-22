"use client";

import { useState } from "react";
import { FEEDBACK_REASONS, type FeedbackReason } from "@/server/feedback";

type FeedbackState = "idle" | "choosing" | "sending" | "sent" | "failed";

const REASONS = Object.entries(FEEDBACK_REASONS) as Array<[FeedbackReason, string]>;
const linkClass =
  "min-h-8 text-xs text-muted underline underline-offset-2 transition-colors hover:text-text disabled:cursor-not-allowed";

export function FeedbackControl({ reportId, position }: { reportId: string; position: number }) {
  const [state, setState] = useState<FeedbackState>("idle");

  const send = async (reason: FeedbackReason) => {
    setState("sending");
    try {
      const response = await fetch(`/api/reports/${encodeURIComponent(reportId)}/feedback`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ position, reason }),
      });
      setState(response.ok ? "sent" : "failed");
    } catch {
      setState("failed");
    }
  };

  if (state === "sent") {
    return (
      <p role="status" className="mt-4 text-xs text-muted">
        Thanks. Your report was recorded.
      </p>
    );
  }
  if (state === "idle") {
    return (
      <div className="mt-3">
        <button type="button" onClick={() => setState("choosing")} className={linkClass}>
          Report a false positive
        </button>
      </div>
    );
  }

  return (
    <fieldset className="mt-4 border-t border-line pt-3" disabled={state === "sending"}>
      <legend className="float-left mb-1 w-full text-xs text-muted">
        Why is this a false positive?
      </legend>
      <div className="clear-both flex flex-wrap gap-x-4 gap-y-1">
        {REASONS.map(([reason, label]) => (
          <button key={reason} type="button" onClick={() => send(reason)} className={linkClass}>
            {label}
          </button>
        ))}
      </div>
      {state === "failed" ? (
        <p role="alert" className="mt-1 text-xs text-danger">
          Your report could not be sent. Please try again.
        </p>
      ) : null}
    </fieldset>
  );
}
