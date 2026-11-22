import { decodesAndExecutes, downloadsAndExecutes } from "../shell.js";
import type { TextKind } from "../targets.js";
import { findHiddenCharacters, type LineIndex } from "../text.js";
import type { Reporter } from "./reporter.js";

const AUDIENCE = String.raw`(?:the\s{1,3})?(?:user|developer|human|operator)`;
const GAP = String.raw`[^\n.;:!?]{0,40}`;

/** Telling an agent to drop its rules is worth a look, and repos sometimes do it harmlessly. */
const OVERRIDE_PATTERNS = [
  /\b(?:ignore|disregard|forget|override|bypass)\b[^\n.;:!?]{0,40}\b(?:previous|prior|above|earlier|preceding|system|all other)\b[^\n.;:!?]{0,30}\b(?:instructions?|rules?|prompts?|directions?|guidelines?)\b/i,
  /\byou\s{1,3}are\s{1,3}now\s{1,3}(?:in\s{1,3})?(?:developer|jailbreak|dan|unrestricted)\b/i,
];

/** Telling an agent to keep something from the person using it has no routine purpose. */
const CONCEALMENT_PATTERNS = [
  new RegExp(
    String.raw`\b(?:do not|don['\u2019]?t|never)\s{1,3}(?:tell|inform|notify|alert|warn|show|mention|reveal|disclose)\s{1,3}${AUDIENCE}\b(?!\s{1,3}to\b)`,
    "i",
  ),
  new RegExp(
    String.raw`\b(?:do not|don['\u2019]?t|never)\s{1,3}(?:tell|inform|notify|alert|warn|show|mention|reveal|disclose)\s{1,3}(?:this|these|that|it|anything|your\s{1,3}(?:actions?|changes?|steps?)|what\s{1,3}you)\b[^\n.;:!?]{0,20}\bto\s{1,3}${AUDIENCE}\b`,
    "i",
  ),
  new RegExp(
    String.raw`\bwithout\s{1,3}(?:telling|informing|notifying|alerting|warning)\s{1,3}${AUDIENCE}\b`,
    "i",
  ),
  new RegExp(String.raw`\bhide\b${GAP}\bfrom\s{1,3}${AUDIENCE}\b`, "i"),
  new RegExp(String.raw`\bkeep\b${GAP}\bsecret\s{1,3}from\s{1,3}${AUDIENCE}\b`, "i"),
];

const CLAUSE = String.raw`[^\n.;:!?]{0,80}?`;
const CREDENTIAL_FILE = String.raw`(?:\.env\b(?!\.(?:example|sample|template|dist))|~?/?\.ssh\b|id_rsa|id_ed25519|\.aws/credentials|\.netrc|\.npmrc|\.git-credentials)`;
const SECRET_WORD = String.raw`(?:\bcredentials?\b|\bapi[ _-]?keys?\b|\bsecrets?\b(?!\s{1,3}(?:gist|manager|store|scanning|scanner|rotation))|\b(?:access|auth)\s{1,3}tokens?\b|\bprivate\s{1,3}keys?\b|\bpasswords?\b)`;
const KEY_FILE = String.raw`(?:~?/?\.ssh/|\bid_rsa\b|\bid_ed25519\b|\.aws/credentials|\.netrc\b|\.git-credentials|~/\.npmrc)`;
const SEND = String.raw`\b(?:send|upload|post|exfiltrate|transmit|forward|leak|steal|email)\b(?!-)`;
const OUTSIDE = String.raw`[^\n;!?]{0,60}?\b(?:to|at)\s{1,3}(?:https?://|(?:the\s{1,3}|a\s{1,3})?(?:webhook|pastebin|discord|telegram)\b)`;

// Technical docs often say "send the API key" about normal auth. A generic secret only counts
// with a theft verb or an outside destination, while named credential files always count.
const CREDENTIAL_PATTERNS = [
  new RegExp(String.raw`${SEND}${CLAUSE}${CREDENTIAL_FILE}`, "gi"),
  new RegExp(String.raw`\b(?:exfiltrate|steal|leak|harvest)\b(?!-)${CLAUSE}${SECRET_WORD}`, "gi"),
  new RegExp(String.raw`${SEND}${CLAUSE}${SECRET_WORD}${OUTSIDE}`, "gi"),
  // "Read(" is permission-rule syntax, which names a path instead of asking to read it.
  new RegExp(
    String.raw`\b(?:read|cat|print|dump|collect|harvest|copy|extract|grab)\b(?!\()${CLAUSE}${KEY_FILE}`,
    "gi",
  ),
  /\b(?:cat|type|Get-Content)\s{1,3}[^\n|]{0,40}\.env\b[^\n]{0,40}\|\s{0,3}(?:curl|wget|nc)\b/gi,
];

const NEGATION =
  /\b(?:never|not|cannot|avoid|without|no|den(?:y|ies|ied)|blocks?|prevents?|protects?|restricts?|excludes?|forbids?)\b|n['\u2019]t\b/i;
const NOUN_BEFORE = /\b(?:the|a|an|this|that|our|your)\s{1,3}$/i;
const FETCH_OR_DECODE =
  /\b(?:curl|wget|iwr|irm|iex|invoke-webrequest|invoke-expression|base64|eval)\b/i;

// Only exact tool markers qualify, so a comment cannot pass as one by starting with a keyword.
const COMMENT_PRAGMA =
  /^\s*(?:prettier-ignore(?:-start|-end)?|markdownlint-(?:disable|enable|capture|restore|configure-file)[\w-]{0,20}(?:\s{1,4}[\w/-]{1,40}){0,8}|eslint-(?:disable|enable)[\w-]{0,20}(?:\s{1,4}[\w/-]{1,40}){0,8}|cspell:\S{1,40}(?:\s{1,4}\S{1,40}){0,8}|\/?toc|(?:BEGIN|END):[\w-]{1,60}|(?:START|END) doctoc\b[\w ]{0,80}|DON'T EDIT THIS SECTION, INSTEAD RE-RUN doctoc TO UPDATE)\s*$/i;
const COMMENT_DIRECTIVE =
  /\b(?:you must|you should|always|never|ignore|execute|run|install|download|send|fetch|curl|wget|assistant|agent|instructions?|do not)\b/i;

function isNegatedClause(line: string, index: number): boolean {
  const before = line.slice(Math.max(0, index - 80), index);
  const clauseStart = Math.max(...[".", ";", ":", "!", "?", ","].map((p) => before.lastIndexOf(p)));
  return NEGATION.test(before.slice(clauseStart + 1));
}

function isNounUse(line: string, index: number): boolean {
  return NOUN_BEFORE.test(line.slice(Math.max(0, index - 12), index));
}

function targetsCredentials(line: string): boolean {
  return CREDENTIAL_PATTERNS.some((pattern) => {
    for (const match of line.matchAll(pattern)) {
      if (!isNegatedClause(line, match.index) && !isNounUse(line, match.index)) return true;
    }
    return false;
  });
}

function warnsAgainstCommand(line: string): boolean {
  const index = line.search(FETCH_OR_DECODE);
  return index >= 0 && isNegatedClause(line, index);
}

function reportHiddenCharacters(content: string, lines: LineIndex, report: Reporter): void {
  let lastLine = 0;
  for (const offset of findHiddenCharacters(content)) {
    const { line } = lines.position(offset);
    if (line !== lastLine) report("INJ-001", offset);
    lastLine = line;
  }
}

function reportHtmlComments(content: string, report: Reporter): void {
  let start = content.indexOf("<!--");
  while (start !== -1) {
    const end = content.indexOf("-->", start + 4);
    const body = content.slice(start + 4, end === -1 ? content.length : end).slice(0, 4000);
    // A comment inside inline code is displayed when rendered, so it is not hidden.
    const isInlineCode = content[start - 1] === "`";
    if (!isInlineCode && !COMMENT_PRAGMA.test(body) && COMMENT_DIRECTIVE.test(body)) {
      report("INJ-004", start);
    }
    if (end === -1) break;
    start = content.indexOf("<!--", end + 3);
  }
}

export function runTextRules(
  kind: TextKind,
  path: string,
  content: string,
  lines: LineIndex,
  report: Reporter,
): void {
  reportHiddenCharacters(content, lines, report);
  if (kind === "data") return;

  // Docs and container build files often hold install one-liners. Nothing here proves the line
  // runs by itself, so these rank below the same command in a hook or lifecycle setting.
  const isLowerRisk = kind === "instruction" || path.startsWith(".devcontainer/");
  const execOptions = isLowerRisk ? ({ severity: "medium" } as const) : undefined;

  for (let number = 1; number <= lines.lineCount; number++) {
    const line = lines.line(number);
    if (!line.trim()) continue;
    const offset = lines.startOf(number);
    const isWarning = kind === "instruction" && warnsAgainstCommand(line);

    if (!isWarning && downloadsAndExecutes(line)) report("EXEC-001", offset, execOptions);
    if (!isWarning && decodesAndExecutes(line)) report("EXEC-002", offset, execOptions);

    if (kind === "instruction") {
      if (CONCEALMENT_PATTERNS.some((pattern) => pattern.test(line))) {
        report("INJ-002", offset);
      } else if (OVERRIDE_PATTERNS.some((pattern) => pattern.test(line))) {
        report("INJ-002", offset, { severity: "medium" });
      }
      if (targetsCredentials(line)) report("INJ-003", offset);
    }
  }

  if (kind === "instruction") reportHtmlComments(content, report);
}
