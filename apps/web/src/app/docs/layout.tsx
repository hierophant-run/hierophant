import type { ReactNode } from "react";
import { DocsNav } from "@/components/site/DocsNav";
import { SiteShell } from "@/components/site/SiteShell";

export default function DocsLayout({ children }: { children: ReactNode }) {
  return (
    <SiteShell>
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-14">
        <DocsNav />
        <article className="doc-prose max-w-3xl min-w-0">{children}</article>
      </div>
    </SiteShell>
  );
}
