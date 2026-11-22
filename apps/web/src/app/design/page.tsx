import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { Logo } from "@/components/brand/Logo";
import { LogoMark } from "@/components/brand/LogoMark";
import { Wordmark } from "@/components/brand/Wordmark";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { StatusBadge } from "@/components/ui/StatusBadge";

export const metadata: Metadata = {
  title: "Design system",
  robots: { index: false, follow: false },
};

const colorTokens = [
  { name: "--bg", value: "#061519", use: "Page background" },
  { name: "--surface", value: "#0B2024", use: "Cards" },
  { name: "--line", value: "#1C3A3D", use: "Borders" },
  { name: "--text", value: "#F2EFE4", use: "Primary text" },
  { name: "--muted", value: "#A9BBB6", use: "Secondary text" },
  { name: "--accent", value: "#F4E9CD", use: "Primary buttons" },
  { name: "--dot", value: "#F6D98B", use: "Logo dot, highlights" },
  { name: "--danger", value: "#FF6B3D", use: "Danger states only" },
  { name: "--on-accent", value: "#0A1E22", use: "Text on cream" },
  { name: "--dot-on-light", value: "#B45309", use: "Logo dot on cream" },
];

const logoSizes = [96, 64, 40, 32, 24, 16];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-line py-10">
      <Eyebrow className="mb-6">{title}</Eyebrow>
      {children}
    </section>
  );
}

export default function DesignPage() {
  if (process.env.NODE_ENV !== "development") {
    notFound();
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-8">
      <header className="pb-10">
        <Logo size={40} />
        <h1 className="mt-8 text-4xl font-medium tracking-tight sm:text-5xl">Design system</h1>
        <p className="mt-3 max-w-xl text-muted">
          Tokens and base components for Hierophant. This page only exists in development.
        </p>
      </header>

      <Section title="Colors">
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {colorTokens.map((token) => (
            <li key={token.name} className="border border-line bg-surface">
              <div className="h-20 border-b border-line" style={{ background: token.value }} />
              <div className="p-3">
                <p className="font-mono text-xs text-text">{token.name}</p>
                <p className="mt-1 font-mono text-xs text-muted">{token.value}</p>
                <p className="mt-1 text-xs text-muted">{token.use}</p>
              </div>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Typography">
        <div className="space-y-5">
          <p className="text-4xl leading-tight font-medium tracking-tight sm:text-6xl">
            Reveal what your agent is about to trust.
          </p>
          <p className="text-2xl font-medium tracking-tight">Section heading in Geist</p>
          <p className="max-w-2xl text-base leading-relaxed text-muted">
            Body copy uses Geist with the muted token, which stays readable on both the page
            background and card surfaces.
          </p>
          <p className="font-mono text-sm break-all text-text">.claude/settings.json:12</p>
        </div>
      </Section>

      <Section title="Logo">
        <div className="flex flex-wrap items-end gap-4 sm:gap-10">
          {logoSizes.map((size) => (
            <figure key={size} className="flex flex-col items-center gap-2">
              <LogoMark size={size} title={`Hierophant symbol at ${size} pixels`} />
              <figcaption className="font-mono text-xs text-muted">{size}</figcaption>
            </figure>
          ))}
        </div>

        <div className="mt-10 grid grid-cols-1 lg:grid-cols-2">
          <div className="flex min-h-40 items-center justify-center overflow-hidden border border-line p-6">
            <Logo variant="dark" size={48} />
          </div>
          <div className="flex min-h-40 items-center justify-center overflow-hidden bg-accent p-6">
            <Logo variant="light" size={48} />
          </div>
        </div>

        <div className="mt-10 overflow-hidden">
          <Wordmark className="text-[clamp(3rem,13vw,9rem)]" />
        </div>
      </Section>

      <Section title="Buttons">
        <div className="flex flex-wrap gap-3">
          <Button>Start a check</Button>
          <Button variant="secondary">How it works</Button>
          <Button href="/design">Link button</Button>
          <Button disabled>Disabled</Button>
          <Button variant="secondary" disabled>
            Disabled
          </Button>
        </div>
      </Section>

      <Section title="Status badges">
        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge status="dangerous" />
          <StatusBadge status="needs_review" />
          <StatusBadge status="no_issues_found" rulesetVersion="0.0.0" />
        </div>
      </Section>

      <Section title="Cards">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <Card>
            <Eyebrow>Example</Eyebrow>
            <h2 className="mt-4 text-lg font-medium">Session hook runs on open</h2>
            <p className="mt-2 font-mono text-sm break-all text-muted">.claude/settings.json:12</p>
            <div className="mt-5">
              <StatusBadge status="dangerous" />
            </div>
          </Card>
          <Card>
            <Eyebrow>Example</Eyebrow>
            <h2 className="mt-4 text-lg font-medium">Unpinned MCP package</h2>
            <p className="mt-2 font-mono text-sm break-all text-muted">.mcp.json:7</p>
            <div className="mt-5">
              <StatusBadge status="needs_review" />
            </div>
          </Card>
        </div>
      </Section>
    </main>
  );
}
