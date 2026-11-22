import type { Metadata } from "next";
import Link from "next/link";
import { Contact } from "@/components/site/Contact";
import { docsHref, GITHUB_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Terms of Use",
  description: "The terms for using the hosted Hierophant service.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <>
      <h1>Terms of Use</h1>
      <p>Last updated: November 23, 2026</p>
      <p>These terms apply to your use of Hierophant. By using the service, you agree to them.</p>

      <h2>The service</h2>
      <p>
        Hierophant performs automated static checks on agent files in public GitHub repositories and
        produces reports. It does not execute repository content.
      </p>

      <h2>No guarantee</h2>
      <p>
        Results are automated signals. They can be incomplete or wrong. A result of{" "}
        <strong>No issues found</strong> does not mean a repository is harmless. You remain
        responsible for deciding what to open, trust, or run. See the{" "}
        <Link href={docsHref("/limitations")}>limitations</Link>.
      </p>

      <h2>Acceptable use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>Bypass rate limits or disrupt the service.</li>
        <li>Attempt to access data or systems you are not authorized to access.</li>
        <li>Present a report as proof that a project or person is malicious.</li>
        <li>Alter a report or badge, or display a badge for a different repository or commit.</li>
        <li>Use the service to find targets for attacks.</li>
      </ul>

      <h2>Reports about third-party repositories</h2>
      <p>
        Repository content belongs to its owners. Owners can request a correction or removal under
        our <Link href="/report-policy">report policy</Link>.
      </p>

      <h2>Open source code</h2>
      <p>
        The <a href={GITHUB_URL}>Hierophant source code</a> is licensed under the Apache License
        2.0. That license governs your use of the code. These terms govern your use of the hosted
        service. Neither grants rights to use the Hierophant name or logo, except to describe where
        the software came from.
      </p>

      <h2>Third-party names</h2>
      <p>
        Product names are used only to describe compatibility. Hierophant is not affiliated with or
        endorsed by those products.
      </p>

      <h2>Availability</h2>
      <p>
        We may change, limit, or stop any part of the service at any time, and we may block use that
        breaks these terms.
      </p>

      <h2>Disclaimer of warranties</h2>
      <p>
        The service is provided “as is” and “as available”, without warranties of any kind, to the
        extent permitted by law.
      </p>

      <h2>Limitation of liability</h2>
      <p>
        To the extent permitted by law, Hierophant is not liable for damages arising from your use
        of the service or reliance on its results.
      </p>

      <h2>Changes</h2>
      <p>We will post any changes to these terms on this page and update the date above.</p>

      <h2>Contact</h2>
      <p>
        For questions, contact us through <Contact />.
      </p>
    </>
  );
}
