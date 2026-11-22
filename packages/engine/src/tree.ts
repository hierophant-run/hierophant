import { isAlias, isMap, isScalar, isSeq, parseDocument, type Document } from "yaml";
import { MAX_TREE_DEPTH, MAX_TREE_NODES } from "./limits.js";

export type ScalarNode = {
  kind: "scalar";
  offset: number;
  value: string | number | boolean | null;
};
export type ArrayNode = { kind: "array"; offset: number; items: TreeNode[] };
export type ObjectEntry = { key: string; keyOffset: number; value: TreeNode };
export type ObjectNode = { kind: "object"; offset: number; entries: ObjectEntry[] };
export type TreeNode = ScalarNode | ArrayNode | ObjectNode;

export class ParseFailure extends Error {}

class JsoncParser {
  private index = 0;
  private nodes = 0;

  constructor(private readonly text: string) {
    if (text.charCodeAt(0) === 0xfeff) this.index = 1;
  }

  parse(): TreeNode {
    const value = this.value(0);
    this.skipTrivia();
    if (this.index < this.text.length) this.fail("unexpected trailing content");
    return value;
  }

  private fail(message: string): never {
    throw new ParseFailure(`${message} at offset ${this.index}`);
  }

  private skipTrivia(): void {
    const { text } = this;
    while (this.index < text.length) {
      const code = text.charCodeAt(this.index);
      if (code === 32 || code === 9 || code === 10 || code === 13) {
        this.index += 1;
      } else if (code === 47 && text.charCodeAt(this.index + 1) === 47) {
        const end = text.indexOf("\n", this.index);
        this.index = end === -1 ? text.length : end + 1;
      } else if (code === 47 && text.charCodeAt(this.index + 1) === 42) {
        const end = text.indexOf("*/", this.index + 2);
        if (end === -1) this.fail("unterminated comment");
        this.index = end + 2;
      } else {
        return;
      }
    }
  }

  private value(depth: number): TreeNode {
    if (depth > MAX_TREE_DEPTH) this.fail("document is nested too deeply");
    this.nodes += 1;
    if (this.nodes > MAX_TREE_NODES) this.fail("document has too many values");
    this.skipTrivia();

    const offset = this.index;
    const character = this.text[this.index];
    if (character === "{") return this.object(depth, offset);
    if (character === "[") return this.array(depth, offset);
    if (character === '"') return { kind: "scalar", offset, value: this.string() };
    return { kind: "scalar", offset, value: this.literal() };
  }

  private object(depth: number, offset: number): ObjectNode {
    const entries: ObjectEntry[] = [];
    this.index += 1;
    for (;;) {
      this.skipTrivia();
      if (this.text[this.index] === "}") {
        this.index += 1;
        return { kind: "object", offset, entries };
      }
      if (this.text[this.index] !== '"') this.fail("expected a property name");
      const keyOffset = this.index;
      const key = this.string();
      this.skipTrivia();
      if (this.text[this.index] !== ":") this.fail("expected a colon");
      this.index += 1;
      entries.push({ key, keyOffset, value: this.value(depth + 1) });
      this.skipTrivia();
      if (this.text[this.index] === ",") this.index += 1;
      else if (this.text[this.index] !== "}") this.fail("expected a comma");
    }
  }

  private array(depth: number, offset: number): ArrayNode {
    const items: TreeNode[] = [];
    this.index += 1;
    for (;;) {
      this.skipTrivia();
      if (this.text[this.index] === "]") {
        this.index += 1;
        return { kind: "array", offset, items };
      }
      items.push(this.value(depth + 1));
      this.skipTrivia();
      if (this.text[this.index] === ",") this.index += 1;
      else if (this.text[this.index] !== "]") this.fail("expected a comma");
    }
  }

  private string(): string {
    const { text } = this;
    const parts: string[] = [];
    let start = this.index + 1;
    let i = start;
    for (;;) {
      if (i >= text.length) this.fail("unterminated string");
      const code = text.charCodeAt(i);
      if (code === 34) {
        parts.push(text.slice(start, i));
        this.index = i + 1;
        return parts.join("");
      }
      if (code === 92) {
        parts.push(text.slice(start, i));
        const escape = text[i + 1];
        const simple: Record<string, string> = {
          '"': '"',
          "\\": "\\",
          "/": "/",
          b: "\b",
          f: "\f",
          n: "\n",
          r: "\r",
          t: "\t",
        };
        if (escape === "u") {
          const hex = text.slice(i + 2, i + 6);
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) this.fail("invalid unicode escape");
          parts.push(String.fromCharCode(parseInt(hex, 16)));
          i += 6;
        } else if (escape !== undefined && simple[escape] !== undefined) {
          parts.push(simple[escape]!);
          i += 2;
        } else {
          this.fail("invalid escape");
        }
        start = i;
      } else {
        i += 1;
      }
    }
  }

  private literal(): string | number | boolean | null {
    const rest = this.text.slice(this.index, this.index + 64);
    const match = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(rest);
    if (!match) this.fail("unexpected token");
    this.index += match[0].length;
    if (match[0] === "true") return true;
    if (match[0] === "false") return false;
    if (match[0] === "null") return null;
    return Number(match[0]);
  }
}

export function parseJsonc(text: string): TreeNode {
  return new JsoncParser(text).parse();
}

export function parseYaml(text: string): TreeNode {
  let document: Document.Parsed;
  try {
    document = parseDocument(text);
  } catch {
    throw new ParseFailure("invalid YAML");
  }
  if (document.errors.length > 0) throw new ParseFailure("invalid YAML");

  let nodes = 0;
  const convert = (node: unknown, depth: number): TreeNode => {
    nodes += 1;
    if (depth > MAX_TREE_DEPTH || nodes > MAX_TREE_NODES) {
      throw new ParseFailure("YAML document is too complex");
    }
    const resolved = isAlias(node) ? node.resolve(document) : node;
    if (isMap(resolved)) {
      return {
        kind: "object",
        offset: resolved.range?.[0] ?? 0,
        entries: resolved.items.map((pair) => {
          const keyNode = pair.key;
          const key = isScalar(keyNode) ? String(keyNode.value) : "";
          const keyOffset = isScalar(keyNode) ? (keyNode.range?.[0] ?? 0) : 0;
          return { key, keyOffset, value: convert(pair.value, depth + 1) };
        }),
      };
    }
    if (isSeq(resolved)) {
      return {
        kind: "array",
        offset: resolved.range?.[0] ?? 0,
        items: resolved.items.map((item) => convert(item, depth + 1)),
      };
    }
    if (isScalar(resolved)) {
      const { value } = resolved;
      const isPlain =
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean" ||
        value === null;
      return {
        kind: "scalar",
        offset: resolved.range?.[0] ?? 0,
        value: isPlain ? value : String(value),
      };
    }
    return { kind: "scalar", offset: 0, value: null };
  };
  return convert(document.contents, 0);
}

/** Reads a nested property. On duplicate keys the last one wins, as in JSON.parse. */
export function get(node: TreeNode | undefined, ...keys: string[]): TreeNode | undefined {
  let current = node;
  for (const key of keys) {
    if (current?.kind !== "object") return undefined;
    let found: TreeNode | undefined;
    for (const entry of current.entries) {
      if (entry.key === key) found = entry.value;
    }
    current = found;
  }
  return current;
}

export function entryOf(node: TreeNode | undefined, key: string): ObjectEntry | undefined {
  if (node?.kind !== "object") return undefined;
  let found: ObjectEntry | undefined;
  for (const entry of node.entries) {
    if (entry.key === key) found = entry;
  }
  return found;
}

export function asString(node: TreeNode | undefined): string | undefined {
  return node?.kind === "scalar" && typeof node.value === "string" ? node.value : undefined;
}

export function asStrings(node: TreeNode | undefined): string[] {
  if (node?.kind !== "array") return [];
  return node.items.flatMap((item) => {
    if (item.kind !== "scalar" || item.value === null) return [];
    return [String(item.value)];
  });
}
