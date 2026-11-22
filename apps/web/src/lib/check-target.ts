import { parsePackageSpec } from "@hierophant/engine/packages";

export const TOKEN_CHAINS = {
  ethereum: { label: "Ethereum", family: "evm", explorer: "https://etherscan.io/token/" },
  base: { label: "Base", family: "evm", explorer: "https://basescan.org/token/" },
  arbitrum: { label: "Arbitrum", family: "evm", explorer: "https://arbiscan.io/token/" },
  optimism: {
    label: "Optimism",
    family: "evm",
    explorer: "https://optimistic.etherscan.io/token/",
  },
  polygon: { label: "Polygon", family: "evm", explorer: "https://polygonscan.com/token/" },
  bsc: { label: "BNB Chain", family: "evm", explorer: "https://bscscan.com/token/" },
  solana: { label: "Solana", family: "solana", explorer: "https://solscan.io/token/" },
} as const;

export type TokenChain = keyof typeof TOKEN_CHAINS;
export type PackageKind = "npm" | "pypi";

export type CheckTarget =
  | { kind: PackageKind; name: string; requested: string | null }
  | { kind: "mcp"; name: string }
  | { kind: "skill"; owner: string; repo: string; path: string; ref?: string }
  | { kind: "token"; chain: TokenChain; address: string };

export type CheckFormInput = {
  type: "package" | "mcp" | "skill" | "token";
  value: string;
  ecosystem: PackageKind;
  chain: TokenChain;
};

const MCP_NAME = /^[A-Za-z0-9.-]{1,120}\/[A-Za-z0-9._-]{1,120}$/;
const OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;
const REPO = /^[A-Za-z0-9._-]{1,100}$/;
const PATH_SEGMENT = /^[A-Za-z0-9._-]{1,100}$/;
const REF = /^[A-Za-z0-9._/-]{1,200}$/;
const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const SOLANA_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const MAX_SKILL_DEPTH = 12;

const isTokenChain = (value: string): value is TokenChain => Object.hasOwn(TOKEN_CHAINS, value);

function decodeSegments(segments: readonly string[]): string[] | null {
  try {
    return segments.map((segment) => decodeURIComponent(segment));
  } catch {
    return null;
  }
}

function parseSkill(segments: string[], ref?: string | null): CheckTarget | null {
  const [owner, rawRepo, ...rest] = segments;
  if (!owner || !rawRepo || !OWNER.test(owner)) return null;
  const repo = rawRepo.replace(/\.git$/i, "");
  if (!REPO.test(repo) || repo === "." || repo === "..") return null;

  const parts = rest.at(-1) === "SKILL.md" ? rest.slice(0, -1) : rest;
  if (parts.length > MAX_SKILL_DEPTH) return null;
  if (parts.some((part) => part === "." || part === ".." || !PATH_SEGMENT.test(part))) return null;
  if (ref && (!REF.test(ref) || ref.startsWith("-") || ref.includes(".."))) return null;
  return { kind: "skill", owner, repo, path: parts.join("/"), ...(ref ? { ref } : {}) };
}

/** Validates a check URL. Sources are only ever contacted with the parts returned here. */
export function parseCheckPath(
  kind: string,
  rawSegments: readonly string[],
  ref?: string | null,
): CheckTarget | null {
  const segments = decodeSegments(rawSegments);
  if (!segments || segments.length === 0) return null;

  if (kind === "npm" || kind === "pypi") {
    const parsed = parsePackageSpec(kind === "npm" ? "npm" : "PyPI", segments.join("/"));
    return parsed ? { kind, name: parsed.name, requested: parsed.requested } : null;
  }
  if (kind === "mcp") {
    const name = segments.join("/");
    return MCP_NAME.test(name) && !name.includes("..") ? { kind, name } : null;
  }
  if (kind === "skill") return parseSkill(segments, ref);
  if (kind === "token" && segments.length === 2) {
    const [chain, address] = segments as [string, string];
    if (!isTokenChain(chain)) return null;
    const isValid =
      TOKEN_CHAINS[chain].family === "evm"
        ? EVM_ADDRESS.test(address)
        : SOLANA_ADDRESS.test(address);
    if (!isValid) return null;
    return {
      kind,
      chain,
      address: TOKEN_CHAINS[chain].family === "evm" ? address.toLowerCase() : address,
    };
  }
  return null;
}

const encodePart = (value: string) => encodeURIComponent(value).replace(/%40/g, "@");

export function checkPath(target: CheckTarget): string {
  switch (target.kind) {
    case "npm":
    case "pypi": {
      const spec = target.requested ? `${target.name}@${target.requested}` : target.name;
      return `/check/${target.kind}/${spec.split("/").map(encodePart).join("/")}`;
    }
    case "mcp":
      return `/check/mcp/${target.name.split("/").map(encodePart).join("/")}`;
    case "skill": {
      const parts = [target.owner, target.repo, ...(target.path ? target.path.split("/") : [])];
      const query = target.ref ? `?ref=${encodeURIComponent(target.ref)}` : "";
      return `/check/skill/${parts.map(encodePart).join("/")}${query}`;
    }
    case "token":
      return `/check/token/${target.chain}/${target.address}`;
  }
}

function skillFromInput(value: string): CheckTarget | null {
  const path = value
    .replace(/^https:\/\/github\.com\//i, "")
    .split(/[?#]/, 1)[0]!
    .replace(/\/+$/, "");
  const parts = path.split("/");
  const [owner, repo, marker, ref, ...rest] = parts;
  if (!owner || !repo) return null;
  if (marker === "tree" || marker === "blob") {
    return ref ? parseSkill([owner, repo, ...rest], ref) : null;
  }
  return parseSkill(parts);
}

/** Turns what a visitor typed into a validated target. */
export function targetFromInput(input: CheckFormInput): CheckTarget | null {
  const value = input.value.trim();
  if (!value || value.length > 300) return null;

  switch (input.type) {
    case "package": {
      const spec = value
        .replace(/^https?:\/\/(?:www\.)?npmjs\.com\/package\//i, "")
        .replace(/^https?:\/\/pypi\.org\/project\//i, "")
        .replace(/\/+$/, "");
      return parseCheckPath(input.ecosystem, spec.split("/"));
    }
    case "mcp":
      return parseCheckPath("mcp", value.split("/"));
    case "skill":
      return skillFromInput(value);
    case "token":
      return parseCheckPath("token", [input.chain, value]);
  }
}
