import type { Metadata } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import type { ReactNode } from "react";
import { SITE_URL, X_HANDLE } from "@/lib/site";
import "./globals.css";

const DESCRIPTION =
  "Check repos, packages, MCP servers, agent skills, and token metadata before your AI coding agent trusts them. Nothing is installed or executed.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Hierophant",
    template: "%s | Hierophant",
  },
  description: DESCRIPTION,
  applicationName: "Hierophant",
  openGraph: { siteName: "Hierophant", type: "website", description: DESCRIPTION },
  twitter: {
    card: "summary_large_image",
    site: X_HANDLE,
    creator: X_HANDLE,
    description: DESCRIPTION,
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
