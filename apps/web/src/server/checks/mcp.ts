import { scan, type PackageRef } from "@hierophant/engine";
import { checkPackages } from "@hierophant/intel";
import type { CheckTarget } from "@/lib/check-target";
import { ApiError } from "../errors";
import {
  buildResult,
  cleanText,
  fetchJson,
  findingSignal,
  isRecord,
  safeHttpsUrl,
  type CheckContext,
  type CheckResult,
  type CheckSignal,
} from "./common";
import { packageSignals } from "./packages";

const REGISTRY = "https://registry.modelcontextprotocol.io/v0.1/servers";
const OFFICIAL_META = "io.modelcontextprotocol.registry/official";
const MAX_RESPONSE_BYTES = 512 * 1024;
const MAX_ITEMS = 8;
const MAX_PACKAGE_LOOKUPS = 3;

const records = (value: unknown) =>
  Array.isArray(value) ? value.filter(isRecord).slice(0, MAX_ITEMS) : [];
const text = (value: unknown) => (typeof value === "string" ? value : "");

const argumentValues = (value: unknown) =>
  records(value).flatMap((argument) => [text(argument.name), text(argument.value)].filter(Boolean));

const defaults = (value: unknown) =>
  Object.fromEntries(
    records(value).flatMap((item) =>
      text(item.name) && text(item.default) ? [[text(item.name), text(item.default)]] : [],
    ),
  );

/** Rebuilds the launch command as a config, so the same MCP rules used on repos apply here. */
function toVirtualConfig(
  packages: Array<Record<string, unknown>>,
  remotes: Array<Record<string, unknown>>,
) {
  const servers: Record<string, unknown> = {};
  packages.forEach((item, index) => {
    const identifier = text(item.identifier);
    const version = text(item.version);
    const type = text(item.registryType);
    if (type !== "npm" && type !== "pypi") return;
    const pinned = type === "npm" ? `${identifier}@${version}` : `${identifier}==${version}`;
    servers[`package-${index}`] = {
      command: type === "npm" ? "npx" : "uvx",
      args: [
        ...argumentValues(item.runtimeArguments),
        ...(type === "npm" ? ["-y"] : []),
        version ? pinned : identifier,
        ...argumentValues(item.packageArguments),
      ],
      env: defaults(item.environmentVariables),
    };
  });
  remotes.forEach((remote, index) => {
    servers[`remote-${index}`] = { url: text(remote.url), headers: defaults(remote.headers) };
  });
  return JSON.stringify({ mcpServers: servers }, null, 2);
}

function packageRefs(packages: Array<Record<string, unknown>>): PackageRef[] {
  return packages.flatMap((item) => {
    const type = text(item.registryType);
    const name = text(item.identifier);
    if ((type !== "npm" && type !== "pypi") || !name) return [];
    return [
      {
        ecosystem: type === "npm" ? ("npm" as const) : ("PyPI" as const),
        name: type === "pypi" ? name.replace(/[-_.]+/g, "-").toLowerCase() : name,
        requested: text(item.version) || null,
        path: "server.json",
        line: 1,
      },
    ];
  });
}

export async function runMcpCheck(
  target: Extract<CheckTarget, { kind: "mcp" }>,
  context: CheckContext,
): Promise<CheckResult> {
  const registryUrl = `${REGISTRY}/${encodeURIComponent(target.name)}/versions/latest`;
  const { status, body } = await fetchJson(
    context.fetch,
    registryUrl,
    { headers: { accept: "application/json", "user-agent": "hierophant" } },
    MAX_RESPONSE_BYTES,
  );
  if (status === 404) throw new ApiError("check_not_found");
  if (status !== 200 || !isRecord(body) || !isRecord(body.server)) {
    throw new ApiError("check_unavailable");
  }

  const server = body.server;
  const packages = records(server.packages);
  const remotes = records(server.remotes);
  const signals: CheckSignal[] = [];

  const meta = isRecord(body._meta) ? body._meta[OFFICIAL_META] : null;
  const registryStatus = isRecord(meta) ? text(meta.status) : "";
  if (registryStatus && registryStatus !== "active") {
    signals.push({
      severity: "medium",
      title: `The registry lists this server as ${cleanText(registryStatus, 24)}`,
      detail: "Check why it is no longer active before you install it.",
    });
  }

  const description = [text(server.title), text(server.description)].filter(Boolean).join("\n");
  const scanned = scan([
    { path: ".mcp.json", content: toVirtualConfig(packages, remotes) },
    { path: "CLAUDE.md", content: description || "No description." },
  ]);
  for (const finding of scanned.findings) {
    const where = finding.path === "CLAUDE.md" ? "Registry description" : "Server configuration";
    signals.push(findingSignal(finding, where));
  }

  const refs = packageRefs(packages).slice(0, MAX_PACKAGE_LOOKUPS);
  if (refs.length > 0) {
    const summary = await checkPackages(refs, { fetch: context.fetch });
    signals.push(...summary.checks.flatMap(packageSignals));
  }

  for (const item of packages) {
    const type = text(item.registryType);
    if (type && type !== "npm" && type !== "pypi") {
      signals.push({
        severity: "info",
        title: `Uses a ${cleanText(type, 16)} package`,
        detail: `${cleanText(text(item.identifier))} was not inspected because this package type is not supported yet.`,
      });
    }
    const secrets = records(item.environmentVariables)
      .filter((variable) => variable.isSecret === true)
      .map((variable) => cleanText(text(variable.name), 40))
      .filter(Boolean);
    if (secrets.length > 0) {
      signals.push({
        severity: "info",
        title: `Asks for ${secrets.length === 1 ? "a secret" : `${secrets.length} secrets`}`,
        detail: `${secrets.join(", ")}. Use a token with the lowest access it needs.`,
      });
    }
  }
  for (const remote of remotes) {
    const url = safeHttpsUrl(remote.url);
    signals.push({
      severity: "info",
      title: url ? `Connects to ${new URL(url).host}` : "Connects to a remote server",
      detail: "Data your agent sends to this server leaves your computer.",
    });
  }

  const repository = isRecord(server.repository) ? safeHttpsUrl(server.repository.url) : null;
  const version = cleanText(text(server.version), 32);
  return buildResult({
    target,
    kindLabel: "MCP server",
    name: cleanText(text(server.title) || target.name),
    subtitle: `${cleanText(target.name, 120)}${version ? ` \u00B7 v${version}` : ""}`,
    sourceUrl: repository ?? registryUrl,
    signals,
    checked: [
      "Official MCP Registry record",
      "Launch command, remote hosts, and declared secrets",
      "Registry description for hidden instructions",
      "npm and PyPI packages against OSV",
    ],
    notChecked: ["The server's source code", "What its tools do at runtime", "Container images"],
  });
}
