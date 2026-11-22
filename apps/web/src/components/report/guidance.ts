import type { AgentId } from "@hierophant/engine";
import { packageSeverity } from "@hierophant/intel";
import type { ReportView } from "@/server/report-view";
import { AGENT_LABELS } from "@/components/landing/content";

export type OpeningStep = { title: string; body: string };

const AGENT_STEPS: Record<AgentId, string> = {
  "claude-code":
    "Decline the trust dialog until you finish reviewing, and do not run claude -p in this folder, because it skips that dialog.",
  cursor: "Turn on Workspace Trust first, because Cursor leaves it off by default.",
  vscode: "Stay in Restricted Mode until you finish reviewing the flagged files.",
  "antigravity-cli": "Do not confirm workspace trust until you finish reviewing the flagged files.",
  "gemini-cli": "Make sure Trusted Folders is on in your user settings before you open this repo.",
};

export function openingSteps(report: ReportView): OpeningStep[] {
  const steps: OpeningStep[] = [
    {
      title: "Read the flagged files first",
      body: "Open each finding on GitHub and read it before the repo is on your machine.",
    },
    {
      title: "Use a disposable environment",
      body: "Clone it into a container or VM that has none of your credentials, SSH keys, or tokens.",
    },
  ];

  if (report.packages?.checks.some((check) => packageSeverity(check.verdict) !== null)) {
    steps.push({
      title: "Review the listed packages",
      body: "Do not run a package listed as malicious or missing from its registry. Update any with known vulnerabilities.",
    });
  }

  for (const entry of report.impact) {
    if (entry.impact === "not_detected") continue;
    steps.push({ title: `In ${AGENT_LABELS[entry.agent]}`, body: AGENT_STEPS[entry.agent] });
  }
  return steps;
}
