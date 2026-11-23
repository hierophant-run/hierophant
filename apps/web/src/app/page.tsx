import type { Metadata } from "next";
import { CheckPanel } from "@/components/check/CheckPanel";
import { CliInstall } from "@/components/landing/CliInstall";
import { Footer } from "@/components/landing/Footer";
import { HowItWorks, WhatWeDontClaim } from "@/components/landing/InfoSections";
import "@/components/landing/landing.css";
import { Navbar } from "@/components/landing/Navbar";
import { NetworkDiagram } from "@/components/landing/NetworkDiagram";
import { ProductGrid } from "@/components/landing/ProductGrid";
import { RotatingWord } from "@/components/landing/RotatingWord";
import { ScanWidget } from "@/components/landing/ScanWidget";
import { ScrollStage } from "@/components/landing/ScrollStage";
import { SupportedTools } from "@/components/landing/SupportedTools";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { X_HANDLE } from "@/lib/site";

const TITLE = "Hierophant: check what you add to your AI agent";
const DESCRIPTION =
  "Check repos, packages, MCP servers, agent skills, and token metadata before your AI coding agent trusts them. Nothing is installed or executed.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: "/" },
  openGraph: { title: TITLE, description: DESCRIPTION, type: "website", siteName: "Hierophant" },
  twitter: {
    card: "summary_large_image",
    site: X_HANDLE,
    creator: X_HANDLE,
    title: TITLE,
    description: DESCRIPTION,
  },
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
          Pre-trust checks for AI coding agents
        </p>
        <h1 className="mt-4 text-[2.15rem] leading-[1.08] font-medium tracking-[-0.03em] sm:text-5xl lg:text-[clamp(2.5rem,3.45vw,3.1rem)]">
          Check what you add to your AI agent, before you click Trust.
        </h1>
        <RotatingWord />
        <p className="mt-3 hidden max-w-xl text-base leading-7 text-muted sm:block">
          Hierophant inspects what you are about to add, then shows what could run or steer your
          agent.
        </p>
        <CheckPanel className="mt-4" />
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
          <CliInstall />
          <WhatWeDontClaim />
        </div>
      </main>
      <Footer />
    </div>
  );
}
