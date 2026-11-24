import type { Metadata } from "next";
import { SiteShell } from "@/components/site/SiteShell";
import { tokenDescription, TokenView } from "@/components/token/TokenView";
import { TOKEN_LAUNCH } from "@/lib/token-launch";

export const metadata: Metadata = {
  title: "$HIEROPHANT",
  description: tokenDescription(TOKEN_LAUNCH),
  alternates: { canonical: "/token" },
};

export default function TokenPage() {
  return (
    <SiteShell>
      <TokenView launch={TOKEN_LAUNCH} />
    </SiteShell>
  );
}
