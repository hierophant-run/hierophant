import {
  BEHAVIOR_CHECKED_ON,
  MAX_FILE_CHARS,
  MAX_FILES,
  MAX_TOTAL_CHARS,
  RULESET_VERSION,
} from "@hierophant/engine";
import type { Metadata } from "next";
import { docsHref } from "@/lib/site";

export const metadata: Metadata = {
  title: "How it works",
  description: "How Hierophant reads agent files, applies its rules, and builds a report.",
  alternates: { canonical: docsHref("/how-it-works") },
};

export default function HowItWorksPage() {
  return (
    <>
      <h1>How it works</h1>
      <p>
        Hierophant is a static checker. It reads files as text and applies a fixed, versioned set of
        rules. It does not use a language model, and it never runs anything from the repository.
      </p>

      <h2>1. Resolve the commit</h2>
      <p>
        Hierophant asks the GitHub API for the repository and resolves the default branch, or the
        branch in your URL, to one commit. Private repositories are refused.
      </p>

      <h2>2. Read the agent files</h2>
      <p>
        It downloads only files that agents load or run, such as hook settings, instruction files,
        MCP configs, editor tasks, dev containers, and the root <code>package.json</code>. It also
        reads local scripts that those files launch. The repository is not cloned, installed, or
        built. Symbolic links, submodules, and binary files are skipped.
      </p>

      <h2>3. Apply the rules</h2>
      <p>
        Ruleset v{RULESET_VERSION} looks for automatic commands, remote code, concealed payloads,
        risky MCP servers, weakened approvals, and text that tries to steer an agent.
      </p>

      <h2>4. Map the impact on each agent</h2>
      <p>
        Each finding is matched against what the vendor documents about Claude Code, Cursor, VS
        Code, Antigravity CLI, and Gemini CLI. Those sources were last checked on{" "}
        {BEHAVIOR_CHECKED_ON}. When a vendor does not document a behavior, the report says{" "}
        <strong>Behavior unknown</strong> instead of guessing.
      </p>

      <h2>5. Check the packages</h2>
      <p>
        If an agent file would download a package with a tool like <code>npx</code> or{" "}
        <code>uvx</code>, Hierophant looks up its name and version in OSV, npm, and PyPI. It flags
        packages listed as malicious, packages missing from the registry, known vulnerabilities, and
        packages created in the last 30 days. Only package names and versions are sent. Results are
        renewed when a report older than a day is scanned again.
      </p>

      <h2>6. Save the report</h2>
      <p>
        A report stores metadata: the repository, commit, ruleset version, status, rule IDs, file
        paths, line numbers, and package results. File contents and excerpts are not stored. If
        the same commit was already checked with the same ruleset, you get the existing report.
      </p>

      <h2>Scan limits</h2>
      <ul>
        <li>Up to {MAX_FILES} agent files per scan.</li>
        <li>Up to {MAX_FILE_CHARS / 1024} KB per file.</li>
        <li>Up to {MAX_TOTAL_CHARS / (1024 * 1024)} MB of text in total.</li>
        <li>Up to 25 findings shown per file, most severe first.</li>
        <li>Up to 20 packages per scan.</li>
        <li>About 20 seconds per scan.</li>
      </ul>
      <p>
        The hosted site currently reads about 30 files per scan, starting with hooks and
        configurations. Anything left out because of a limit is listed in the report.
      </p>
    </>
  );
}
