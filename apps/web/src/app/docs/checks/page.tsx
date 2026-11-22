import type { Metadata } from "next";
import Link from "next/link";
import { docsHref, siteHref } from "@/lib/site";

export const metadata: Metadata = {
  title: "Checks",
  description: "How Hierophant checks packages, MCP servers, agent skills, and token metadata.",
  alternates: { canonical: docsHref("/checks") },
};

export default function ChecksPage() {
  return (
    <>
      <h1>Checks</h1>
      <p>
        Besides full repositories, Hierophant can check individual things you add to an agent. Open{" "}
        <Link href={siteHref("/check")}>the check page</Link> and choose a type. Nothing is
        installed or executed, and each result can be shown as a badge.
      </p>

      <h2>Packages</h2>
      <p>
        For npm and PyPI packages, Hierophant reads the registry record and looks up the version in
        OSV. It flags packages listed as malicious, missing names, known vulnerabilities, and
        packages created in the last 30 days. It also notes install scripts and deprecation.
      </p>

      <h2>MCP servers</h2>
      <p>
        For servers in the official MCP Registry, Hierophant inspects the launch command, remote
        hosts, declared secrets, npm and PyPI packages, and the description. It does not run the
        server or inspect what its tools do at runtime.
      </p>

      <h2>Agent skills</h2>
      <p>
        For a public GitHub folder that contains <code>SKILL.md</code>, Hierophant reads up to 25
        text files at one commit. It looks for hidden instructions, remote code, concealed payloads,
        and <code>allowed-tools</code> settings that pre-approve any command.
      </p>

      <h2>Token metadata</h2>
      <p>
        <strong>This is not a safety rating, audit, or investment advice.</strong> Hierophant reads
        a token’s on-chain name, symbol, decimals, and contract or metadata URI as text, then looks
        for hidden characters or instructions aimed at AI agents.
      </p>
      <p>
        Result pages have an optional button that loads holder and DEX liquidity figures from
        GeckoTerminal and DexScreener. Your browser contacts those services directly, so they
        receive your IP address and the token address. These figures are context only. They can be
        wrong or manipulated, and they do not affect the result.
      </p>
      <p>
        It does not check the contract, ownership, price, whether liquidity is real or locked, or
        whether a token can be sold. A token with no injection found can still be a scam.
        Off-chain metadata is never fetched.
      </p>
      <p>Supported chains: Ethereum, Base, Arbitrum, Optimism, Polygon, BNB Chain, Robinhood Chain, and
        Solana.</p>

      <h2>Results and badges</h2>
      <p>
        Results are computed when requested and are not stored. Badges show the current status, can
        be cached for up to an hour, and are not a guarantee.
      </p>
    </>
  );
}
