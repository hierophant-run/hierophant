import { MAX_EXCERPT_CHARS, MAX_LINE_CHARS } from "./limits.js";

export class LineIndex {
  private readonly starts: number[] = [0];

  constructor(private readonly text: string) {
    for (let i = text.indexOf("\n"); i !== -1; i = text.indexOf("\n", i + 1)) {
      this.starts.push(i + 1);
    }
  }

  get lineCount(): number {
    return this.starts.length;
  }

  /** Converts a character offset to a 1-based line and column. */
  position(offset: number): { line: number; column: number } {
    let low = 0;
    let high = this.starts.length - 1;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      if (this.starts[middle]! <= offset) low = middle;
      else high = middle - 1;
    }
    return { line: low + 1, column: offset - this.starts[low]! + 1 };
  }

  /** Returns the character offset where a 1-based line starts. */
  startOf(lineNumber: number): number {
    return this.starts[lineNumber - 1] ?? this.text.length;
  }

  /** Returns a 1-based line without its line ending, clipped for pattern matching. */
  line(lineNumber: number): string {
    const start = this.starts[lineNumber - 1];
    if (start === undefined) return "";
    const next = this.starts[lineNumber];
    const end = next === undefined ? this.text.length : next - 1;
    return this.text.slice(start, Math.min(end, start + MAX_LINE_CHARS)).replace(/\r$/, "");
  }
}

function isAlwaysHidden(codePoint: number): boolean {
  return (
    codePoint === 0x200b ||
    codePoint === 0x2060 ||
    codePoint === 0xfeff ||
    (codePoint >= 0x202a && codePoint <= 0x202e) ||
    (codePoint >= 0x2066 && codePoint <= 0x2069) ||
    (codePoint >= 0xe0000 && codePoint <= 0xe007f) ||
    (codePoint >= 0xe0100 && codePoint <= 0xe01ef)
  );
}

const JOINS_EMOJI = /[\p{Extended_Pictographic}\p{Emoji_Modifier}\uFE0F]/u;
const NON_LATIN_LETTER = /(?![\p{Script=Latin}])\p{L}|\p{M}/u;

function isLegitimateJoiner(text: string, index: number): boolean {
  const before = index > 0 ? String.fromCodePoint(codePointBefore(text, index)) : "";
  const afterPoint = text.codePointAt(index + 1);
  const after = afterPoint === undefined ? "" : String.fromCodePoint(afterPoint);
  if (JOINS_EMOJI.test(before) && JOINS_EMOJI.test(after)) return true;
  return NON_LATIN_LETTER.test(before) && NON_LATIN_LETTER.test(after);
}

function codePointBefore(text: string, index: number): number {
  const low = text.charCodeAt(index - 1);
  if (index >= 2 && low >= 0xdc00 && low <= 0xdfff) {
    const point = text.codePointAt(index - 2);
    if (point !== undefined && point > 0xffff) return point;
  }
  return low;
}

/** Returns the offset of every invisible character that has no legitimate typographic role. */
export function findHiddenCharacters(text: string): number[] {
  const offsets: number[] = [];
  for (let i = 0; i < text.length;) {
    const codePoint = text.codePointAt(i)!;
    const size = codePoint > 0xffff ? 2 : 1;
    const isByteOrderMark = codePoint === 0xfeff && i === 0;
    if (!isByteOrderMark) {
      if (isAlwaysHidden(codePoint)) offsets.push(i);
      else if ((codePoint === 0x200c || codePoint === 0x200d) && !isLegitimateJoiner(text, i)) {
        offsets.push(i);
      }
    }
    i += size;
  }
  return offsets;
}

const UNSAFE_DISPLAY =
  // eslint-disable-next-line no-misleading-character-class -- This class lists invisible characters on purpose.
  /[\p{Cc}\u00AD\u200B-\u200F\u2028\u2029\u202A-\u202E\u2060-\u2069\uFEFF\u{E0000}-\u{E007F}\u{E0100}-\u{E01EF}]/gu;

function showHidden(text: string): string {
  return text.replace(UNSAFE_DISPLAY, (character) => {
    if (character === "\t") return " ";
    const code = character.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0");
    return `U+${code}`;
  });
}

const SECRET_VALUE_PATTERNS = [
  /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{16,}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/,
  /\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{16,}\b/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/,
  /\bnpm_[A-Za-z0-9]{20,}\b/,
  /\bglpat-[A-Za-z0-9_-]{16,}\b/,
  /\bAIza[0-9A-Za-z_-]{30,}\b/,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}\b/,
];

const REDACTED = "[REDACTED]";

/** True when the value contains a token in a well-known credential format. */
export function hasKnownSecretFormat(value: string): boolean {
  return SECRET_VALUE_PATTERNS.some((pattern) => pattern.test(value));
}

/** True when a value points at a variable or an obvious placeholder, not a real credential. */
export function isReferenceOrPlaceholder(value: string): boolean {
  const trimmed = value.trim().replace(/^bearer\s+/i, "");
  if (!trimmed) return true;
  if (/^\$\{?[\w:.-]+\}?$/.test(trimmed) || trimmed.includes("${")) return true;
  if (/^<.*>$/.test(trimmed) || /^\{\{.*\}\}$/.test(trimmed) || /^%\w+%$/.test(trimmed)) {
    return true;
  }
  return /^(?:x{3,}|\*{3,}|\.{3,})$|your|example|placeholder|changeme|change[-_]me|replace|redacted|todo/i.test(
    trimmed,
  );
}

export function redact(text: string): string {
  let result = text;
  for (const pattern of SECRET_VALUE_PATTERNS) {
    result = result.replace(new RegExp(pattern.source, "g"), REDACTED);
  }
  return result
    .replace(/-----BEGIN [A-Z ]{0,40}PRIVATE KEY-----.*/g, REDACTED)
    .replace(/\b(https?:\/\/)[^\s/@:]{1,200}:[^\s/@]{1,200}@/gi, `$1${REDACTED}@`)
    .replace(/\b(bearer\s+)[A-Za-z0-9._~+/-]{8,}=*/gi, `$1${REDACTED}`)
    .replace(
      /\b([\w-]{0,40}(?:api[_-]?key|token|secret|passw(?:or)?d|credential)[\w-]{0,20}["']?\s{0,3}[:=]\s{0,3}["']?)([^\s"',;&]{4,})/gi,
      (match, prefix: string, value: string) =>
        isReferenceOrPlaceholder(value) ? match : `${prefix}${REDACTED}`,
    );
}

export function toExcerpt(line: string): string | undefined {
  const cleaned = showHidden(redact(line)).trim();
  if (!cleaned) return undefined;
  if (cleaned.length <= MAX_EXCERPT_CHARS) return cleaned;
  return `${Array.from(cleaned)
    .slice(0, MAX_EXCERPT_CHARS - 1)
    .join("")}\u2026`;
}

function shannonEntropy(text: string): number {
  const counts = new Map<string, number>();
  for (const character of text) counts.set(character, (counts.get(character) ?? 0) + 1);
  let entropy = 0;
  for (const count of counts.values()) {
    const probability = count / text.length;
    entropy -= probability * Math.log2(probability);
  }
  return entropy;
}

function longestEncodedRun(text: string): string {
  let bestStart = 0;
  let bestLength = 0;
  let start = -1;
  for (let i = 0; i <= text.length; i++) {
    const code = i < text.length ? text.charCodeAt(i) : -1;
    const isEncoded =
      (code >= 48 && code <= 57) ||
      (code >= 65 && code <= 90) ||
      (code >= 97 && code <= 122) ||
      code === 43 ||
      code === 47 ||
      code === 61;
    if (isEncoded) {
      if (start === -1) start = i;
    } else if (start !== -1) {
      if (i - start > bestLength) {
        bestStart = start;
        bestLength = i - start;
      }
      start = -1;
    }
  }
  return text.slice(bestStart, bestStart + bestLength);
}

function countMatches(text: string, pattern: RegExp, stopAt: number): number {
  let count = 0;
  for (const _match of text.matchAll(pattern)) {
    count += 1;
    if (count >= stopAt) break;
  }
  return count;
}

/** Heuristic for scripts packed to prevent review. Ordinary minified code does not match. */
export function looksObfuscated(source: string): boolean {
  if (countMatches(source, /\b_0x[a-f0-9]{3,}\b/gi, 20) >= 20) return true;
  if (countMatches(source, /\\x[0-9a-f]{2}/gi, 100) >= 100) return true;

  const run = longestEncodedRun(source);
  if (run.length >= 2000 && shannonEntropy(run) > 5) return true;
  return run.length >= 500 && /\b(?:eval|Function|exec)\s*\(/.test(source);
}
