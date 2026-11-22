import type { Metadata } from "next";
import Link from "next/link";
import { docsHref } from "@/lib/site";
import { Contact } from "@/components/site/Contact";
import { DraftNotice } from "@/components/site/DraftNotice";

export const metadata: Metadata = {
  title: "Terms of Use (Draft)",
  description: "Draft terms of use for Hierophant.",
  robots: { index: false, follow: true },
};

export default function TermsPage() {
  return (
    <>
      <DraftNotice />
      <h1 className="mt-8">Terms of Use</h1>
      <p>Last updated: [date of publication]</p>
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

      <h2>Third-party names</h2>
      <p>
        Product names are used only to describe compatibility. Hierophant is not affiliated with or
        endorsed by those products.
      </p>

      <h2>Disclaimer of warranties</h2>
      <p>
        [To be finalized with legal counsel.] The service is provided “as is” and “as available”,
        without warranties of any kind, to the extent permitted by law.
      </p>

      <h2>Limitation of liability</h2>
      <p>
        [To be finalized with legal counsel.] To the extent permitted by law, Hierophant is not
        liable for damages arising from your use of the service or reliance on its results.
      </p>

      <h2>Changes</h2>
      <p>
        We may change the service or these terms. Material changes will be reflected on this page.
      </p>

      <h2>Governing law</h2>
      <p>[Governing law and venue to be decided with legal counsel.]</p>

      <h2>Contact</h2>
      <p>
        Questions: <Contact />
      </p>
    </>
  );
}
