import type { Metadata } from "next";
import Link from "next/link";
import { docsHref, GITHUB_URL, siteHref } from "@/lib/site";

export const metadata: Metadata = {
  title: "Quickstart",
  description: "Check a public GitHub repository before you open it with an AI coding agent.",
  alternates: { canonical: docsHref() },
};

export default function QuickstartPage() {
  return (
    <>
      <h1>Quickstart</h1>
      <p>
        Hierophant shows what a public GitHub repository would make your AI coding agent do, before
        you trust it. There is nothing to install and no account to create.
      </p>

      <h2>Check a repository</h2>
      <ol>
        <li>
          Paste a URL like <code>https://github.com/owner/repo</code> into the{" "}
          <Link href={siteHref("/#check-repo")}>scan form</Link>.
        </li>
        <li>Read the verdict and the Open Impact table for the agents you use.</li>
        <li>Open each finding. It shows the file, the line, why it matters, and how to fix it.</li>
        <li>Follow the steps under “Open this repo with less risk” before you click Trust.</li>
      </ol>

      <h2>Read the verdict</h2>
      <table>
        <thead>
          <tr>
            <th scope="col">Status</th>
            <th scope="col">Meaning</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Dangerous</td>
            <td>At least one finding has critical or high severity.</td>
          </tr>
          <tr>
            <td>Needs review</td>
            <td>At least one finding has medium or low severity.</td>
          </tr>
          <tr>
            <td>No issues found</td>
            <td>
              The rules in this ruleset version matched nothing. This is not a guarantee, and it
              does not prove a repository is harmless.
            </td>
          </tr>
        </tbody>
      </table>

      <h2>Read Open Impact</h2>
      <table>
        <thead>
          <tr>
            <th scope="col">Impact</th>
            <th scope="col">Meaning</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Runs on open</td>
            <td>Official documentation says this runs automatically.</td>
          </tr>
          <tr>
            <td>Runs after trust prompt</td>
            <td>This runs after you trust the folder or approve a prompt.</td>
          </tr>
          <tr>
            <td>Steers the agent</td>
            <td>This runs no command, but it changes the instructions your agent follows.</td>
          </tr>
          <tr>
            <td>Behavior unknown</td>
            <td>There is a finding, but official documentation does not explain the behavior.</td>
          </tr>
          <tr>
            <td>Not detected</td>
            <td>No finding affects this agent in this ruleset version.</td>
          </tr>
        </tbody>
      </table>

      <h2>Read package checks</h2>
      <p>
        When a repo would download and run a package, the report shows what public registries and
        OSV say about it. A package listed as malicious makes the report Dangerous. A missing
        package, a known vulnerability, or a package created in the last 30 days makes it Needs
        review. <strong>No known issues</strong> does not mean a package is harmless.
      </p>

      <h2>Share a report</h2>
      <p>
        Each report has its own link. Anyone with the link can open it, and search engines are told
        not to index it. Code excerpts appear only in the browser tab that ran the scan, so they are
        not part of a shared link.
      </p>

      <h2>Add a badge</h2>
      <p>
        A report page includes a Markdown badge for your README. It shows the real status, the
        ruleset version, and the commit that was checked, and it links to the report. A badge
        describes that one commit, so scan again after you change agent files.
      </p>

      <h2>Watch a repository, MCP server, or skill</h2>
      <p>
        Use the <strong>Watch</strong> tab on the home page, or choose{" "}
        <strong>Watch this repo</strong> on a report. Hierophant checks the default branch
        about every 30 minutes. When an agent file is added, changed, or removed, it records which
        files changed and scans the new commit.
      </p>
      <p>
        The watch page lists every change with its result. Follow it with the RSS feed linked on
        that page, or add its badge to a README. No account is needed. If a repository becomes
        private or is deleted, checks stop.
      </p>
      <p>
        MCP servers and agent skills can be watched from their check result. For an MCP server,
        Hierophant watches its official MCP Registry record: the version, launch packages, remote
        hosts, and description. For a skill, it watches the files in the skill folder. When either
        changes, it runs the check again and adds the result to the feed.
      </p>

      <h2>Local tools</h2>
      <p>
        A command-line scanner, a read-only MCP server, and a settings lock use the same rules. Run
        them with <code>npx @hierophanthq/cli scan .</code>. A preview GitHub Action is available
        from the <a href={GITHUB_URL}>source code on GitHub</a>, but it is not on GitHub Marketplace
        yet.
      </p>
    </>
  );
}
