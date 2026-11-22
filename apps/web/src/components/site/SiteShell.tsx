import type { ReactNode } from "react";
import { Footer } from "@/components/landing/Footer";
import "@/components/landing/landing.css";
import { Navbar } from "@/components/landing/Navbar";
import "./prose.css";

export function SiteShell({ children }: { children: ReactNode }) {
  return (
    <div id="top" className="landing-grain flex min-h-dvh flex-col overflow-x-clip">
      <Navbar />
      <main className="mx-auto w-full max-w-[1240px] flex-1 px-4 pt-28 sm:px-8">{children}</main>
      <Footer />
    </div>
  );
}
