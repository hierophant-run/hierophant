import type { Metadata } from "next";
import { Footer } from "@/components/landing/Footer";
import { HowItWorks, WhatWeDontClaim } from "@/components/landing/InfoSections";
import "@/components/landing/landing.css";
import { Navbar } from "@/components/landing/Navbar";
import { NetworkDiagram } from "@/components/landing/NetworkDiagram";
import { ProductGrid } from "@/components/landing/ProductGrid";
import { RotatingWord } from "@/components/landing/RotatingWord";
import { ScanForm } from "@/components/landing/ScanForm";
import { ScanWidget } from "@/components/landing/ScanWidget";
import { ScrollStage } from "@/components/landing/ScrollStage";
import { SupportedTools } from "@/components/landing/SupportedTools";
import { Eyebrow } from "@/components/ui/Eyebrow";

const TITLE = "Hierophant: see what a repo will make your AI agent do";
const DESCRIPTION =
  "Paste a public GitHub repo and see what its hooks, rules, MCP servers, and auto-run tasks would make your AI coding agent do, before you click Trust.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: "/" },
  openGraph: { title: TITLE, description: DESCRIPTION, type: "website", siteName: "Hierophant" },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

const NO_SCRIPT_STYLES = `
  .scroll-stage { height: auto; }
  .scroll-stage__pin { position: relative; height: auto; overflow: visible; }
  .stage-hero { position: relative; min-height: 100svh; }
  .stage-reveal { position: relative; padding-block: 96px; opacity: 1; visibility: visible; }
  .stage-canvas, .stage-files { display: none; }
`;

function Hero() {
  return (
    <div className="mx-auto w-full max-w-[1240px] px-4 sm:px-8">
      <div className="max-w-[640px] lg:max-w-[min(590px,50vw)]">
        <p className="flex items-center gap-2 font-mono text-xs text-muted">
          <span aria-hidden="true" className="size-1.5 rounded-full bg-dot" />
          Open Impact reports for AI coding agents
        </p>
        <h1 className="mt-4 text-[2.15rem] leading-[1.08] font-medium tracking-[-0.03em] sm:text-5xl lg:text-[clamp(2.5rem,3.45vw,3.1rem)]">
          See what a repo will make your AI agent do, before you click Trust.
        </h1>
        <RotatingWord />
        <p className="mt-3 max-w-xl text-sm leading-6 text-muted sm:text-base sm:leading-7">
          Hierophant inspects a repo&apos;s hooks, rules, and MCP servers, then shows the impact on
          each agent you use.
        </p>
        <ScanForm />
      </div>
    </div>
  );
}

function Reveal() {
  return (
    <div className="max-w-3xl text-center">
      <Eyebrow>Inspection</Eyebrow>
      <h2 className="mt-4 text-4xl leading-[1.1] font-medium tracking-[-0.025em] sm:text-6xl">
        Hooks. Rules. Auto-run tasks.
      </h2>
      <p className="mx-auto mt-5 max-w-xl leading-7 text-muted">
        Hierophant reads the agent files that can run commands or steer your agent, without cloning
        or executing anything.
      </p>
    </div>
  );
}

export default function HomePage() {
  return (
    <div id="top" className="landing-grain min-h-dvh overflow-x-clip">
      <noscript>
        <style>{NO_SCRIPT_STYLES}</style>
      </noscript>
      <Navbar />
      <main>
        <ScrollStage
          hero={
            <>
              <Hero />
              <ScanWidget />
            </>
          }
          reveal={<Reveal />}
        />
        <div className="space-y-28 pt-10 sm:space-y-36">
          <ProductGrid />
          <SupportedTools />
          <NetworkDiagram />
          <HowItWorks />
          <WhatWeDontClaim />
        </div>
      </main>
      <Footer />
    </div>
  );
}
