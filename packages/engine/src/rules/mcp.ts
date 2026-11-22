import type { McpServer, McpValue } from "../facts.js";
import { hostOf, isLocalHost, isRiskyShellWrapper, unpinnedPackages } from "../shell.js";
import { hasKnownSecretFormat, isReferenceOrPlaceholder } from "../text.js";
import type { Reporter } from "./reporter.js";

/** Vendor-operated MCP endpoints. Anything else is shown for review, not treated as malicious. */
const RECOGNIZED_HOSTS = new Set([
  "api.githubcopilot.com",
  "mcp.atlassian.com",
  "mcp.linear.app",
  "mcp.notion.com",
  "mcp.sentry.dev",
  "mcp.stripe.com",
  "mcp.supabase.com",
]);

const SECRET_NAME =
  /(?:token|secret|password|passwd|pwd|api[_-]?key|access[_-]?key|private[_-]?key|credentials?)$/i;
const AUTH_HEADER = /^(?:authorization|proxy-authorization|x-api-key|api-key|x-auth-token)$/i;

function isLiteralSecret({ key, value }: McpValue): boolean {
  if (hasKnownSecretFormat(value)) return true;
  if (isReferenceOrPlaceholder(value)) return false;
  if (!SECRET_NAME.test(key) && !AUTH_HEADER.test(key)) return false;
  return value.replace(/^bearer\s+/i, "").length >= 8 && !/^(?:true|false|\d+)$/i.test(value);
}

function argumentHasSecret(args: readonly string[]): boolean {
  return args.some((arg, index) => {
    if (hasKnownSecretFormat(arg)) return true;
    const inline = /^--?([\w-]{1,60})=(.+)$/.exec(arg);
    if (inline) return isLiteralSecret({ key: inline[1]!, value: inline[2]!, offset: 0 });
    const flag = /^--?([\w-]{1,60})$/.exec(arg);
    const next = args[index + 1];
    if (!flag || next === undefined || next.startsWith("-")) return false;
    return isLiteralSecret({ key: flag[1]!, value: next, offset: 0 });
  });
}

function isUnrecognizedRemote(url: string): boolean {
  const host = hostOf(url);
  if (host === undefined) return true;
  if (isLocalHost(host)) return false;
  return /^http:/i.test(url.trim()) || !RECOGNIZED_HOSTS.has(host);
}

export function runMcpRules(servers: readonly McpServer[], report: Reporter): void {
  for (const server of servers) {
    if (server.command !== undefined) {
      if (unpinnedPackages(server.command, server.args).length > 0) {
        report("MCP-001", server.commandOffset);
      }
      if (isRiskyShellWrapper(server.command, server.args)) {
        report("MCP-004", server.commandOffset);
      }
    }
    if (server.url !== undefined && isUnrecognizedRemote(server.url)) {
      report("MCP-002", server.urlOffset);
    }
    for (const value of [...server.env, ...server.headers]) {
      if (isLiteralSecret(value)) report("MCP-003", value.offset);
    }
    if (argumentHasSecret(server.args)) report("MCP-003", server.argsOffset);
  }
}
