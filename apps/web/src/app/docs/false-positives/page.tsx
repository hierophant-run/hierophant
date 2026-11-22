import type { Metadata } from "next";
import Link from "next/link";
import { docsHref, siteHref } from "@/lib/site";
import { Contact } from "@/components/site/Contact";
import { FEEDBACK_REASONS } from "@/server/feedback";

export const metadata: Metadata = {
  title: "False positives",
  description: "How to report a finding that Hierophant got wrong.",
  alternates: { canonical: docsHref("/false-positives") },
};

export default function FalsePositivesPage() {
  return (
    <>
      <h1>False positives</h1>
      <p>Static rules can flag something harmless. If a finding looks wrong, tell us.</p>

      <h2>Report a finding</h2>
      <ol>
        <li>Open the report and find the card.</li>
        <li>
          Select <strong>Report a false positive</strong>.
        </li>
        <li>Choose the closest reason:</li>
      </ol>
      <ul>
        {Object.values(FEEDBACK_REASONS).map((reason) => (
          <li key={reason}>{reason}</li>
        ))}
      </ul>

      <h2>What is recorded</h2>
      <p>
        We keep a count per finding and reason. There is no free text and no account, and your IP
        address is not stored with it. Because reports are anonymous, we cannot reply to them.
      </p>

      <h2>What happens next</h2>
      <p>
        Reports help us tune the rules. A report does not change an existing result right away. Rule
        changes ship in a new ruleset version, and scanning again applies it.
      </p>

      <h2>If you own the repository</h2>
      <p>
        To ask for a correction or removal, follow the{" "}
        <Link href={siteHref("/report-policy")}>report policy</Link> or write to <Contact />.
      </p>
    </>
  );
}
