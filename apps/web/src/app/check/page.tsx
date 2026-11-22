import type { Metadata } from "next";
import { CheckPanel } from "@/components/check/CheckPanel";
import { Eyebrow } from "@/components/ui/Eyebrow";

const DESCRIPTION =
  "Check repos, packages, MCP servers, agent skills, and token metadata before you add them to your AI coding agent.";

export const metadata: Metadata = {
  title: "Check what you add to your agent",
  description: DESCRIPTION,
  alternates: { canonical: "/check" },
};

export default function CheckPage() {
  return (
    <section className="mx-auto max-w-4xl py-6">
      <Eyebrow>Check</Eyebrow>
      <h1 className="mt-4 text-4xl leading-[1.08] font-medium tracking-[-0.03em] sm:text-6xl">
        Check what you add to your agent.
      </h1>
      <p className="mt-5 max-w-2xl leading-7 text-muted">
        Look up a repo, package, MCP server, agent skill, or token before your agent touches it.
        Nothing is installed or executed, and every result can become a badge.
      </p>
      <div className="mt-8 border border-line bg-surface/40 p-4 sm:p-6">
        <CheckPanel />
      </div>
      <p className="mt-4 text-sm leading-6 text-muted">
        Results are automated signals, not a guarantee. Token checks only read on-chain text and are
        not a safety rating or investment advice.
      </p>
    </section>
  );
}
