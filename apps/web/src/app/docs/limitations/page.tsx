import type { Metadata } from "next";
import { docsHref } from "@/lib/site";

export const metadata: Metadata = {
  title: "Limitations",
  description: "What Hierophant can miss, and why a result is never a guarantee.",
  alternates: { canonical: docsHref("/limitations") },
};

export default function LimitationsPage() {
  return (
    <>
      <h1>Limitations</h1>
      <p>
        Hierophant reduces guesswork. It does not replace your own review or an isolated
        environment.
      </p>

      <h2>A result is not a guarantee</h2>
      <p>
        <strong>No issues found</strong> means the rules in one ruleset version matched nothing at
        one commit. It does not prove that a repository is harmless.
      </p>

      <h2>What it can miss</h2>
      <ul>
        <li>Payloads reworded or hidden in ways the rules do not recognize.</li>
        <li>Malicious application code outside agent files and the scripts they launch.</li>
        <li>
          Package code, which is not downloaded or analyzed. Package checks rely on public advisory
          data, which can be late or incomplete.
        </li>
        <li>Dependencies listed in lockfiles or manifests, which are not checked.</li>
        <li>Content that a script fetches from the network when it runs.</li>
        <li>Files skipped because of size, count, time limits, symbolic links, or submodules.</li>
        <li>Agents and configuration formats that are not supported yet.</li>
      </ul>

      <h2>What it can get wrong</h2>
      <p>
        A finding can be a false positive. A legitimate setup hook and a malicious one can look
        similar. Read the flagged line before you decide.
      </p>

      <h2>Agent behavior changes</h2>
      <p>
        Open Impact relies on vendor documentation at the time it was last checked. Vendors can
        change how their agents work, and your own settings can change the outcome.
      </p>

      <h2>A report describes one commit</h2>
      <p>
        A later commit can add something new. Scan again before you trust an updated repository.
      </p>

      <h2>Only public GitHub repositories</h2>
      <p>Private repositories and other Git hosts are not supported.</p>
    </>
  );
}
