import {
  advisoryUrl,
  checkPackages,
  PACKAGE_FLAG_LABELS,
  packageDisplayName,
  packageUrl,
  type PackageCheck,
} from "@hierophant/intel";
import type { CheckTarget } from "@/lib/check-target";
import { ApiError } from "../errors";
import {
  buildResult,
  cleanText,
  type CheckContext,
  type CheckResult,
  type CheckSignal,
} from "./common";

const TIMEOUT_MS = 6_000;

export function packageSignals(check: PackageCheck): CheckSignal[] {
  const name = cleanText(packageDisplayName(check));
  const first = check.advisories[0];
  const link = first ? { href: advisoryUrl(first) } : {};
  const count = `${check.advisoryCount} ${check.advisoryCount === 1 ? "advisory" : "advisories"}`;
  const signals: CheckSignal[] = [];

  switch (check.verdict) {
    case "malicious":
      signals.push({
        severity: "critical",
        title: `${name} is listed as malicious`,
        detail: `Public advisory data lists this package as malicious (${count}). Do not install or run it.`,
        ...link,
      });
      break;
    case "not_found":
      signals.push({
        severity: "medium",
        title: `${name} is not in the registry`,
        detail:
          "A missing name can be registered by anyone later, so a command that installs it could run an attacker's code.",
      });
      break;
    case "vulnerable":
      signals.push({
        severity: "medium",
        title: `${name} has known vulnerabilities`,
        detail: `OSV lists ${count} for this version. Update it if a fixed version exists.`,
        ...link,
      });
      break;
    case "new_package":
      signals.push({
        severity: "medium",
        title: `${name} was created in the last 30 days`,
        detail:
          "New packages have little history. Review the publisher and source before using it.",
      });
      break;
    case "unresolved":
      signals.push({
        severity: "info",
        title: `${name} uses a version that was not resolved`,
        detail: "Hierophant does not guess version ranges, so advisories were not checked.",
      });
      break;
    case "unavailable":
      signals.push({
        severity: "info",
        title: `${name} could not be checked`,
        detail: "A public source did not respond, so this package has no result.",
      });
      break;
    case "no_known_issues":
      break;
  }

  for (const flag of check.flags) {
    signals.push({
      severity: "info",
      title: `${name}: ${PACKAGE_FLAG_LABELS[flag]}`,
      detail:
        flag === "install_script"
          ? "This package runs code when it is installed."
          : "The publisher marked this version as not recommended.",
    });
  }
  return signals;
}

export async function runPackageCheck(
  target: Extract<CheckTarget, { kind: "npm" | "pypi" }>,
  context: CheckContext,
): Promise<CheckResult> {
  const ecosystem = target.kind === "npm" ? "npm" : "PyPI";
  const summary = await checkPackages(
    [{ ecosystem, name: target.name, requested: target.requested, path: "package", line: 1 }],
    { fetch: context.fetch, timeoutMs: TIMEOUT_MS },
  );
  const check = summary.checks[0];
  if (!check || check.verdict === "unavailable") throw new ApiError("check_unavailable");

  return buildResult({
    target,
    kindLabel: `${ecosystem} package`,
    name: cleanText(packageDisplayName(check)),
    subtitle: check.createdAt ? `Created ${check.createdAt.slice(0, 10)}` : `${ecosystem} registry`,
    sourceUrl: packageUrl(check),
    signals: packageSignals(check),
    checked: [
      "Registry record and version",
      "Known malware and vulnerability advisories in OSV",
      "Package age, install scripts, and deprecation",
    ],
    notChecked: ["The package's source code", "Its dependencies"],
  });
}
