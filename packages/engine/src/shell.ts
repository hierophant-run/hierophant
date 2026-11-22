import { MAX_LINE_CHARS } from "./limits.js";
import { normalizePath } from "./targets.js";

const clip = (text: string) => text.slice(0, MAX_LINE_CHARS);

const FETCHERS = String.raw`curl|wget|iwr|irm|invoke-webrequest|invoke-restmethod`;
const SHELL_TARGETS = String.raw`sh|bash|zsh|dash|ksh|fish|iex|invoke-expression`;
const SCRIPT_TARGETS = String.raw`python[0-9.]{0,6}|perl|ruby|node|php`;
// With an inline script such as `python -c`, piped input is data rather than code.
const INLINE_SCRIPT = String.raw`(?!\s{1,4}-[a-zA-Z]{0,3}[cCeEnprR]\b)`;
const END = String.raw`(?=$|[\s"'\x60);&|])`;
const EXEC_TARGET = `(?:(?:${SHELL_TARGETS})|(?:${SCRIPT_TARGETS})${INLINE_SCRIPT})${END}`;

const DOWNLOAD_EXEC = [
  new RegExp(
    String.raw`(?:^|[^\w-])(?:${FETCHERS})\b[^|\n]{0,500}(?:\|[^|\n]{0,120}){0,2}\|\s{0,4}(?:sudo\s{1,4}(?:-\S{1,12}\s{1,4}){0,3})?(?:env\s{1,4})?(?:[\w./-]{0,60}/)?${EXEC_TARGET}`,
    "i",
  ),
  new RegExp(
    String.raw`(?:^|[\s;&|("'])(?:sh|bash|zsh|dash|ksh|source|eval|\.)\s{1,4}(?:-\w{1,4}\s{1,4}){0,3}["']?(?:<\(|\$\()\s{0,4}(?:curl|wget)\b`,
    "i",
  ),
  /\b(?:iex|invoke-expression)\b[^\n]{0,200}\b(?:iwr|irm|invoke-webrequest|invoke-restmethod|downloadstring)\b/i,
  /\b(?:curl|wget)\b[^;&|\n]{0,300}(?:&&|;)\s{0,4}(?:chmod\s{1,4}\+?\w{1,4}\s{1,4}\S{1,120}\s{0,4}(?:&&|;)\s{0,4})?(?:(?:sh|bash|zsh|python[0-9.]{0,6}|node)\s{1,4}\S{1,120}|\.\/\S{1,120})/i,
];

const ENCODED_EXEC = [
  new RegExp(
    String.raw`base64\s{1,4}(?:-d|-D|--decode)\b[^\n]{0,80}\|\s{0,4}(?:sudo\s{1,4})?${EXEC_TARGET}`,
    "i",
  ),
  /\b(?:eval|bash|sh|zsh)\b[^\n]{0,40}\$\([^)\n]{0,300}base64\s{1,4}(?:-d|-D|--decode)/i,
  new RegExp(String.raw`xxd\s{1,4}-r[^\n]{0,60}\|\s{0,4}${EXEC_TARGET}`, "i"),
  /(?:powershell|pwsh)(?:\.exe)?\b[^\n]{0,60}\s-e(?:nc|ncodedcommand)?\s{1,4}[A-Za-z0-9+/=]{16,}/i,
  /\b(?:eval|exec|Function)\s{0,4}\(\s{0,4}(?:atob|Buffer\.from|base64\.b64decode|bytes\.fromhex|codecs\.decode|unescape)\b/,
  /\bexec\s{0,4}\(\s{0,4}__import__\(\s{0,4}["']base64/,
];

const NETWORK_TOOL =
  /(?:^|[^\w./-])(?:curl|wget|nc|ncat|netcat|socat|scp|ftp|telnet|iwr|irm|invoke-webrequest|invoke-restmethod|bitsadmin|certutil)(?:\.exe)?(?=\s)|\/dev\/(?:tcp|udp)\/|\b(?:urllib\.request|requests\.(?:get|post)|https?\.(?:get|request))\b|\bfetch\s{0,2}\(\s{0,2}["'\x60]https?:/i;

const HIDDEN_SCRIPT = [
  /(?:^|[\s;&|])(?:sh|bash|zsh|node|python[0-9.]{0,6}|perl|ruby|source|\.)\s{1,4}["']?(?:\.?\/)?(?:[\w.-]{1,60}\/){0,8}\.[\w-]{1,60}\.(?:sh|bash|js|mjs|cjs|py|ps1|pl|rb)\b/i,
  /(?:^|[\s;&|])(?:sh|bash|zsh|node|python[0-9.]{0,6}|perl|ruby|source|\.)\s{1,4}["']?(?:\/tmp|\/var\/tmp|\/dev\/shm|%TEMP%|\$TMPDIR|\$\{TMPDIR\})[/\\]/i,
];

export function downloadsAndExecutes(command: string): boolean {
  const text = clip(command);
  return DOWNLOAD_EXEC.some((pattern) => pattern.test(text));
}

export function decodesAndExecutes(command: string): boolean {
  const text = clip(command);
  return ENCODED_EXEC.some((pattern) => pattern.test(text));
}

/** Extracts the host from a URL, ignoring userinfo so `https://good@bad` reports `bad`. */
export function hostOf(url: string): string | undefined {
  const match =
    /^[a-z][a-z0-9+.-]{0,20}:\/\/(?:[^/?#@]{0,256}@)?(\[[^\]]{1,64}\]|[^:/?#]{1,256})/i.exec(
      url.trim(),
    );
  return match?.[1]?.toLowerCase();
}

export function isLocalHost(host: string): boolean {
  return (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host === "0.0.0.0" ||
    host === "[::1]" ||
    /^127(?:\.\d{1,3}){3}$/.test(host)
  );
}

function usesRemoteNetwork(command: string): boolean {
  const text = clip(command);
  if (!NETWORK_TOOL.test(text)) return false;
  if (/\/dev\/(?:tcp|udp)\//.test(text)) return true;

  const hosts = [...text.matchAll(/[a-z][a-z0-9+.-]{1,20}:\/\/[^\s"'\x60<>)]{1,512}/gi)]
    .map((match) => hostOf(match[0]))
    .filter((host): host is string => host !== undefined);
  if (hosts.length > 0) return hosts.some((host) => !isLocalHost(host));
  return !/(?:^|[\s"'@])(?:localhost|127\.0\.0\.1)(?::\d{1,5})?(?:[/\s"']|$)/i.test(text);
}

export function runsHiddenScript(command: string): boolean {
  const text = clip(command);
  return HIDDEN_SCRIPT.some((pattern) => pattern.test(text));
}

export function isSuspiciousCommand(command: string): boolean {
  return (
    downloadsAndExecutes(command) ||
    decodesAndExecutes(command) ||
    usesRemoteNetwork(command) ||
    runsHiddenScript(command)
  );
}

/** Splits a command into words, honoring quotes. It never evaluates anything. */
export function tokenize(command: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let quote: string | null = null;
  let hasToken = false;

  for (const character of clip(command)) {
    if (quote) {
      if (character === quote) quote = null;
      else current += character;
    } else if (character === '"' || character === "'") {
      quote = character;
      hasToken = true;
    } else if (/\s/.test(character)) {
      if (hasToken) tokens.push(current);
      current = "";
      hasToken = false;
    } else {
      current += character;
      hasToken = true;
    }
  }
  if (hasToken) tokens.push(current);
  return tokens;
}

function baseCommand(token: string): string {
  return (token.split(/[\\/]/).pop() ?? token).replace(/\.(?:exe|cmd|bat)$/i, "").toLowerCase();
}

const SHELLS = new Set(["sh", "bash", "zsh", "dash", "ksh", "fish", "cmd", "powershell", "pwsh"]);
const SHELL_COMMAND_FLAG = /^(?:-[a-z]{0,3}c|\/c|\/k|-command)$/i;
const PACKAGE_RUNNERS = new Set(["npx", "pnpx", "bunx", "uvx"]);

/** Returns the inner command when an executable is launched through `shell -c`. */
export function shellWrappedCommand(command: string, args: readonly string[]): string | undefined {
  const tokens = [...tokenize(command), ...args];
  const [first] = tokens;
  if (!first || !SHELLS.has(baseCommand(first))) return undefined;
  const flagIndex = tokens.findIndex((token, index) => index > 0 && SHELL_COMMAND_FLAG.test(token));
  return flagIndex === -1 ? undefined : tokens.slice(flagIndex + 1).join(" ");
}

function isPlainPackageRunner(command: string): boolean {
  if (/[|;&$\x60<>()]/.test(command)) return false;
  const [first, second] = tokenize(command);
  if (!first) return false;
  const base = baseCommand(first);
  return PACKAGE_RUNNERS.has(base) || ((base === "pnpm" || base === "yarn") && second === "dlx");
}

/** `cmd /c npx pkg` is the documented way to start npx on Windows, so it is not flagged. */
export function isRiskyShellWrapper(command: string, args: readonly string[]): boolean {
  const inner = shellWrappedCommand(command, args);
  return inner !== undefined && !isPlainPackageRunner(inner);
}

function isPinnedNodePackage(spec: string): boolean {
  if (/^(?:\.{0,2}\/|file:)/.test(spec)) return true;
  const at = spec.lastIndexOf("@");
  if (at <= 0) return false;
  return /^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/.test(spec.slice(at + 1));
}

function isPinnedPythonPackage(spec: string): boolean {
  if (/^(?:\.{0,2}\/|file:)/.test(spec)) return true;
  return /(?:==|@)\d+(?:\.\d+)*(?:[-+.\w]*)$/.test(spec);
}

function nodePackages(tokens: string[]): string[] {
  const packages: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;
    if (token === "--") {
      if (packages.length === 0 && tokens[i + 1]) packages.push(tokens[i + 1]!);
      break;
    }
    if (token === "-p" || token === "--package") {
      if (tokens[i + 1]) packages.push(tokens[i + 1]!);
      i += 1;
    } else if (token.startsWith("--package=")) {
      packages.push(token.slice("--package=".length));
    } else if (!token.startsWith("-")) {
      if (packages.length === 0) packages.push(token);
      break;
    }
  }
  return packages;
}

function pythonPackages(tokens: string[]): string[] {
  const packages: string[] = [];
  const valueFlags = new Set(["--python", "-p", "--index-url", "--index", "--default-index"]);
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;
    if (token === "--from" || token === "--with") {
      if (tokens[i + 1]) packages.push(tokens[i + 1]!);
      i += 1;
    } else if (valueFlags.has(token)) {
      i += 1;
    } else if (!token.startsWith("-")) {
      if (!tokens.includes("--from")) packages.push(token);
      break;
    }
  }
  return packages;
}

/** Lists packages an MCP server downloads at launch without an exact version. */
export function unpinnedPackages(command: string, args: readonly string[]): string[] {
  const wrapped = shellWrappedCommand(command, args);
  const tokens = wrapped !== undefined ? tokenize(wrapped) : [...tokenize(command), ...args];
  const [first, second] = tokens;
  if (!first) return [];

  const base = baseCommand(first);
  if (base === "npx" || base === "pnpx" || base === "bunx") {
    return nodePackages(tokens.slice(1)).filter((spec) => !isPinnedNodePackage(spec));
  }
  if ((base === "pnpm" || base === "yarn") && second === "dlx") {
    return nodePackages(tokens.slice(2)).filter((spec) => !isPinnedNodePackage(spec));
  }
  if (base === "uvx") {
    return pythonPackages(tokens.slice(1)).filter((spec) => !isPinnedPythonPackage(spec));
  }
  if (base === "pipx" && second === "run") {
    return pythonPackages(tokens.slice(2)).filter((spec) => !isPinnedPythonPackage(spec));
  }
  return [];
}

export type LaunchedPackage = { ecosystem: "npm" | "PyPI"; spec: string };

/** Lists every package a command downloads through a package runner, pinned or not. */
export function launchedPackages(command: string, args: readonly string[]): LaunchedPackage[] {
  const wrapped = shellWrappedCommand(command, args);
  const tokens = wrapped !== undefined ? tokenize(wrapped) : [...tokenize(command), ...args];
  const [first, second] = tokens;
  if (!first) return [];

  const base = baseCommand(first);
  const npm = (rest: string[]) =>
    nodePackages(rest).map((spec): LaunchedPackage => ({ ecosystem: "npm", spec }));
  const python = (rest: string[]) =>
    pythonPackages(rest).map((spec): LaunchedPackage => ({ ecosystem: "PyPI", spec }));

  if (base === "npx" || base === "pnpx" || base === "bunx") return npm(tokens.slice(1));
  if ((base === "pnpm" || base === "yarn") && second === "dlx") return npm(tokens.slice(2));
  if (base === "uvx") return python(tokens.slice(1));
  if (base === "pipx" && second === "run") return python(tokens.slice(2));
  return [];
}

const WORKSPACE_PREFIX =
  /^(?:\$\{?CLAUDE_PROJECT_DIR\}?|\$\{?GEMINI_PROJECT_DIR\}?|\$\{workspaceFolder\}|\$\{localWorkspaceFolder\}|\$\{containerWorkspaceFolder\}|\$PWD|\$\{PWD\})[/\\]/;
const SCRIPT_FILE = /\.(?:sh|bash|zsh|js|mjs|cjs|ts|py|ps1|rb|pl)$/i;

/** Finds repo-relative script files named by a command. */
export function referencedScriptPaths(command: string): string[] {
  const paths = new Set<string>();
  for (const token of tokenize(command)) {
    if (!SCRIPT_FILE.test(token) || token.includes("://")) continue;
    const normalized = normalizePath(token.replace(WORKSPACE_PREFIX, ""));
    if (normalized && !normalized.includes("$")) paths.add(normalized);
  }
  return [...paths];
}
