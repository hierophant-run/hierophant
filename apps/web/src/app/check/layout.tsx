import type { ReactNode } from "react";
import { SiteShell } from "@/components/site/SiteShell";

export default function CheckLayout({ children }: { children: ReactNode }) {
  return <SiteShell>{children}</SiteShell>;
}
