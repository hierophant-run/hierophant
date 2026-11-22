import type { ReactNode } from "react";
import { SiteShell } from "@/components/site/SiteShell";

export default function LegalLayout({ children }: { children: ReactNode }) {
  return (
    <SiteShell>
      <article className="doc-prose mx-auto max-w-3xl min-w-0">{children}</article>
    </SiteShell>
  );
}
