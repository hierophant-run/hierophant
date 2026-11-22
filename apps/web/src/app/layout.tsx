import type { Metadata } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import type { ReactNode } from "react";
import { SITE_URL } from "@/lib/site";
import "./globals.css";

const DESCRIPTION =
  "See what a repo will make your AI coding agent do, before you click Trust. Hierophant reads hooks, rules, and MCP files without running them.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Hierophant",
    template: "%s | Hierophant",
  },
  description: DESCRIPTION,
  applicationName: "Hierophant",
  openGraph: { siteName: "Hierophant", type: "website", description: DESCRIPTION },
  twitter: { card: "summary_large_image", description: DESCRIPTION },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
