import type { Metadata } from "next";
import { Contact } from "@/components/site/Contact";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "What Hierophant processes when you scan a repository or use the website.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <>
      <h1>Privacy Policy</h1>
      <p>Last updated: November 23, 2026</p>
      <p>
        This policy explains what Hierophant processes when you use hierophanthq.com and
        docs.hierophanthq.com. “We” means the team that operates Hierophant.
      </p>

      <h2>What we do not collect</h2>
      <ul>
        <li>No account, name, or email address is needed to scan a repository.</li>
        <li>We do not set cookies ourselves.</li>
        <li>We do not use third-party analytics or advertising.</li>
        <li>We do not store the contents of scanned files.</li>
      </ul>

      <h2>Scan reports</h2>
      <p>
        When you scan a public repository, we store a report containing the repository owner and
        name, commit, ruleset version, status, scan time, agent impact, rule IDs, severities, file
        paths, line numbers, the paths of files that were skipped, and package check results. A
        report is not linked to you.
      </p>
      <p>
        Anyone with a report link can open it. Reports are kept until they are removed, and they do
        not expire automatically at this time. Repository owners can request removal under our{" "}
        <a href="/report-policy">report policy</a>.
      </p>

      <h2>Code excerpts</h2>
      <p>
        After a new scan, short redacted excerpts are sent to your browser and kept in that tab’s
        session storage. They are not saved on our servers and are not part of a shared link.
      </p>

      <h2>IP addresses and rate limiting</h2>
      <p>
        We use your IP address to limit abuse. Our database stores a keyed hash of it with a request
        count, not the address itself. Entries older than two hours are removed by a periodic
        cleanup.
      </p>

      <h2>Package checks</h2>
      <p>
        If a scanned repository would run public packages, our server sends their names and versions
        to OSV, npm, and PyPI. It does not send your IP address, the repository name, or file
        content to these services.
      </p>

      <h2>Watched repositories</h2>
      <p>
        When someone watches a public repository, we store its name, branch, latest commit, and the
        paths and git hashes of its agent files. We never store file contents. Anyone can see which
        public repositories are watched. We do not record who started watching.
      </p>

      <h2>Package, MCP, skill, and token checks</h2>
      <p>
        When you use the check page, our server sends what you entered to the matching public
        source: npm, PyPI, OSV, the MCP Registry, GitHub, or public blockchain RPC providers. These
        results are computed on request and are not stored. Badges can be cached by Cloudflare for
        up to an hour.
      </p>

      <h2>Public token data</h2>
      <p>
        Token result pages have an optional button that loads holder and liquidity figures. Nothing
        is sent until you click it. When you do, your browser connects directly to DexScreener and
        GeckoTerminal. They receive your IP address, browser details, and the token address, and
        handle them under their own privacy policies. We do not receive or store these figures.
      </p>

      <h2>Bot protection</h2>
      <p>
        If bot protection is turned on, Cloudflare Turnstile checks that a scan comes from a person.
        It loads after you start using the scan form. Cloudflare processes signals from your browser
        to run this check under its own privacy policy. We do not send it your IP address from our
        server.
      </p>

      <h2>False-positive reports</h2>
      <p>
        If you report a false positive, we increase a counter for that finding and reason. We do not
        store free text or anything that identifies you.
      </p>

      <h2>Hosting and logs</h2>
      <p>
        Cloudflare hosts Hierophant. To deliver and protect the website, it processes request data
        such as your IP address, the requested URL, browser details, and the time. It may keep this
        data in logs and may set security cookies under its own policies.
      </p>
      <p>
        Our application logs record error codes, the affected feature, and the time. They are
        designed to exclude IP addresses, tokens, and repository content.
      </p>

      <h2>Service providers</h2>
      <ul>
        <li>Cloudflare, which hosts and protects the website.</li>
        <li>Neon, which hosts our database.</li>
        <li>GitHub, which our server contacts to read public repository data.</li>
        <li>OSV, npm, and PyPI, which our server asks about public packages.</li>
        <li>
          The MCP Registry and public blockchain RPC providers, such as PublicNode, dRPC, and Tatum,
          which provide data for the check page.
        </li>
        <li>
          DexScreener and GeckoTerminal, which your browser contacts only if you load public token
          data.
        </li>
      </ul>
      <p>These providers may process data in countries other than your own.</p>

      <h2>Why we process this data</h2>
      <p>
        We process this data to provide the service, keep it reliable, and prevent abuse. Where laws
        such as the GDPR apply, we rely on our legitimate interest in doing so.
      </p>

      <h2>Your rights</h2>
      <p>
        Depending on where you live, you may have rights to access, correct, delete, or object to
        the processing of your personal data. Because Hierophant has no accounts and stores IP
        addresses only as hashes, we may be unable to identify data that relates to you.
      </p>

      <h2>Children</h2>
      <p>Hierophant is a developer tool and is not directed at children.</p>

      <h2>Changes</h2>
      <p>We will post any changes to this policy on this page and update the date above.</p>

      <h2>Contact</h2>
      <p>
        For questions or requests, contact us through <Contact />. GitHub Issues are public, so do
        not include private details there.
      </p>
    </>
  );
}
