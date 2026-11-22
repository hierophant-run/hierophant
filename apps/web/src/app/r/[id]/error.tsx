"use client";

import { Button } from "@/components/ui/Button";
import { Eyebrow } from "@/components/ui/Eyebrow";

export default function ReportError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <section className="py-20">
      <Eyebrow>Report unavailable</Eyebrow>
      <h1 className="mt-4 text-3xl font-medium tracking-tight sm:text-5xl">
        This report could not be loaded.
      </h1>
      <p className="mt-4 max-w-lg leading-7 text-muted">
        Something went wrong on our side. Your link is still valid, so please try again.
      </p>
      <div className="mt-6 flex flex-wrap gap-2">
        <Button onClick={() => retry()}>Try again</Button>
        <Button href="/#scan-url" variant="secondary">
          Scan a repo
        </Button>
      </div>
    </section>
  );
}
