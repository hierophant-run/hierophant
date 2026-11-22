import type { Metadata } from "next";
import Link from "next/link";
import { docsHref } from "@/lib/site";
import { Contact } from "@/components/site/Contact";

export const metadata: Metadata = {
  title: "Report policy",
  description: "How repository owners can request a correction or removal of a Hierophant report.",
  alternates: { canonical: "/report-policy" },
};

export default function ReportPolicyPage() {
  return (
    <>
      <h1>Report policy</h1>
      <p>
        Anyone can scan a public GitHub repository, including one they do not own. This page
        explains what that means for repository owners and how to ask for a correction or removal.
      </p>

      <h2>What a report contains</h2>
      <ul>
        <li>The repository name, commit, scan time, and ruleset version.</li>
        <li>A status, the impact on each agent, and rule findings with file paths and lines.</li>
        <li>Links to the matching lines on GitHub at that commit.</li>
      </ul>
      <p>
        A report does not store your file contents. It is an automated signal about one commit, not
        an accusation and not a statement about the people behind a project.
      </p>

      <h2>Who can see it</h2>
      <p>
        Reports are not listed anywhere on this site and are marked <code>noindex</code> for search
        engines. They are not private: anyone who has the link can open them.
      </p>

      <h2>Request a correction</h2>
      <p>
        For a single finding, use <strong>Report a false positive</strong> on the report. To explain
        a wrong result in more detail, write to <Contact /> with the report link and what is wrong.
        Confirmed errors are fixed through the rules and released in a new ruleset version.
      </p>

      <h2>Request a removal</h2>
      <p>
        If you maintain the repository, write to <Contact /> with:
      </p>
      <ol>
        <li>The report link.</li>
        <li>The repository name.</li>
        <li>
          How we can confirm you maintain it, such as a commit or issue from your GitHub account
          that mentions the request.
        </li>
      </ol>
      <p>
        Removing a report deletes its findings and feedback counts, and its link and badge stop
        working. A cached badge can take a few minutes to disappear.
      </p>
      <p>
        Because the repository is public, someone could scan it again, which creates a new report.
        The best long-term fix is to change the flagged file.
      </p>

      <h2>If a finding is a real problem</h2>
      <p>
        Treat it as you would any security report. See the{" "}
        <Link href={docsHref("/rules")}>rule catalog</Link> for why it was flagged and how to fix
        it. After you fix it, scan the new commit.
      </p>
    </>
  );
}
