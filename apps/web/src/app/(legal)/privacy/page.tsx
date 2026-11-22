import type { Metadata } from "next";
import { Contact } from "@/components/site/Contact";
import { DraftNotice } from "@/components/site/DraftNotice";

export const metadata: Metadata = {
  title: "Privacy Policy (Draft)",
  description: "Draft privacy policy for Hierophant.",
  robots: { index: false, follow: true },
};

export default function PrivacyPage() {
  return (
    <>
      <DraftNotice />
      <h1 className="mt-8">Privacy Policy</h1>
      <p>Last updated: [date of publication]</p>
      <p>This policy describes what Hierophant processes when you use it.</p>

      <h2>What we do not collect</h2>
      <ul>
        <li>No accounts, names, or email addresses are needed to scan a repository.</li>
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
        not expire automatically at this time.
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

      <h2>Bot protection</h2>
      <p>
        When enabled, Cloudflare Turnstile checks that a scan comes from a person. It loads after
        you start using the scan form. Cloudflare processes signals from your browser to run this
        check under its own privacy policy. We do not send it your IP address from our server.
      </p>

      <h2>False-positive reports</h2>
      <p>
        If you report a false positive, we increase a counter for that finding and reason. We do not
        store free text or anything that identifies you.
      </p>

      <h2>Logs</h2>
      <p>
        Our application logs record error codes, the affected feature, and the time. They are
        designed to exclude IP addresses, tokens, and repository content. Our hosting provider may
        keep standard request logs: [confirm details and retention once hosting is chosen].
      </p>

      <h2>Service providers</h2>
      <ul>
        <li>GitHub, which our server contacts to read public repository data.</li>
        <li>Neon, which hosts our database.</li>
        <li>OSV, npm, and PyPI, which our server asks about public packages.</li>
        <li>Cloudflare, when bot protection is enabled.</li>
        <li>[Hosting provider, to be confirmed before launch].</li>
      </ul>

      <h2>Your rights</h2>
      <p>
        Depending on where you live, you may have rights to access, correct, or delete personal
        data. [Legal bases and regional rights to be completed with legal counsel.]
      </p>

      <h2>Contact</h2>
      <p>
        Questions and requests: <Contact />
      </p>
    </>
  );
}
