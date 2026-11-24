import type { Metadata } from "next";
import type { ReactNode } from "react";
import { SiteShell } from "@/components/site/SiteShell";

export const metadata: Metadata = {
  title: "Monitoring",
  robots: { index: false, follow: false },
};

export default function WatchLayout({ children }: { children: ReactNode }) {
  return <SiteShell>{children}</SiteShell>;
}
