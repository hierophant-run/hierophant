import { createHash } from "node:crypto";
import { scan } from "@hierophant/engine";
import { TOKEN_CHAINS, type CheckTarget, type TokenChain } from "@/lib/check-target";
import { ApiError } from "../errors";
import type { FetchLike } from "../github-client";
import { errorName, logError } from "../log";
import {
  buildResult,
  cleanText,
  fetchJson,
  findingSignal,
  isRecord,
  type CheckContext,
  type CheckResult,
  type CheckSignal,
} from "./common";

/** Free endpoints often rate-limit shared cloud IPs, so each chain has several providers. */
const RPC_URLS: Record<TokenChain, readonly string[]> = {
  ethereum: ["https://eth.drpc.org", "https://ethereum-rpc.publicnode.com"],
  base: ["https://base.drpc.org", "https://base-rpc.publicnode.com", "https://mainnet.base.org"],
  arbitrum: [
    "https://arbitrum.drpc.org",
    "https://arbitrum-one-rpc.publicnode.com",
    "https://arb1.arbitrum.io/rpc",
  ],
  optimism: [
    "https://optimism.drpc.org",
    "https://optimism-rpc.publicnode.com",
    "https://mainnet.optimism.io",
  ],
  polygon: ["https://polygon.drpc.org", "https://polygon-bor-rpc.publicnode.com"],
  bsc: [
    "https://bsc-rpc.publicnode.com",
    "https://bsc-dataseed.bnbchain.org",
    "https://bsc.drpc.org",
  ],
  robinhood: ["https://robinhood.drpc.org", "https://robinhood-rpc.publicnode.com"],
  solana: [
    "https://solana-mainnet.gateway.tatum.io",
    "https://solana-rpc.publicnode.com",
    "https://api.mainnet-beta.solana.com",
  ],
};

const MAX_RPC_BYTES = 256 * 1024;
const MAX_TEXT_BYTES = 512;
const RPC_TIMEOUT_MS = 3_500;
const HEDGE_DELAY_MS = 700;
const RPC_CACHE_SECONDS = 3600;
const RPC_CACHE_ORIGIN = "https://hierophanthq.com/__rpc-cache/";
const ERC20_NAME = "0x06fdde03";
const ERC20_SYMBOL = "0x95d89b41";
const METADATA_PROGRAM = "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s";
const TOKEN_2022 = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
const TOKEN_PROGRAMS = new Set(["TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", TOKEN_2022]);
const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const EMPTY_TEXT = { name: "", symbol: "", uri: "" };

const STATUS_LABELS = {
  dangerous: "Injection found",
  needs_review: "Needs review",
  no_issues_found: "No injection found",
};

export const TOKEN_NOTICE =
  "This checks on-chain text only. It is not a safety rating, audit, or investment advice. It does not check the contract, liquidity, holders, ownership, or whether a token can be sold.";

export type TokenText = { name: string; symbol: string; uri: string };

/** A reverted call is a real answer. Any other RPC error means this provider failed. */
function isRevert(error: unknown): boolean {
  if (!isRecord(error)) return false;
  return error.code === 3 || (typeof error.message === "string" && /revert/i.test(error.message));
}

type RpcAnswer = { ok: true; value: unknown } | { ok: false };
type RpcCall = { chain: TokenChain; method: string; params: unknown[] };

const edgeCache = () =>
  (globalThis as unknown as { caches?: { default?: Cache } }).caches?.default ?? null;

const cacheKey = ({ chain, method, params }: RpcCall) => {
  const hash = createHash("sha256")
    .update(JSON.stringify([method, params]))
    .digest("hex");
  return new Request(`${RPC_CACHE_ORIGIN}${chain}/${hash}`);
};

async function readCached(call: RpcCall): Promise<RpcAnswer> {
  try {
    const hit = await edgeCache()?.match(cacheKey(call));
    if (!hit) return { ok: false };
    return { ok: true, value: ((await hit.json()) as { value: unknown }).value };
  } catch {
    return { ok: false };
  }
}

async function writeCached(call: RpcCall, value: unknown): Promise<void> {
  try {
    await edgeCache()?.put(
      cacheKey(call),
      new Response(JSON.stringify({ value }), {
        headers: {
          "cache-control": `public, max-age=${RPC_CACHE_SECONDS}`,
          "content-type": "application/json",
        },
      }),
    );
  } catch {
    // The cache only saves requests, so a failed write changes nothing.
  }
}

async function askProvider(
  fetchImpl: FetchLike,
  url: string,
  call: RpcCall,
  stop: AbortSignal,
): Promise<RpcAnswer> {
  const startedAt = Date.now();
  let cause = "response";
  let responseStatus = 0;
  const tracked: FetchLike = async (input, init) => {
    try {
      return await fetchImpl(input, init);
    } catch (error) {
      cause = errorName(error);
      throw error;
    }
  };
  try {
    const { status, body } = await fetchJson(
      tracked,
      url,
      {
        method: "POST",
        headers: { "content-type": "application/json", "user-agent": "hierophant" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: call.method,
          params: call.params,
        }),
        signal: AbortSignal.any([stop, AbortSignal.timeout(RPC_TIMEOUT_MS)]),
      },
      MAX_RPC_BYTES,
    );
    responseStatus = status;
    if (status === 200 && isRecord(body)) {
      if (!body.error) return { ok: true, value: body.result };
      if (isRevert(body.error)) return { ok: true, value: null };
      cause = "rpc_error";
    }
  } catch {
    // The caller moves on to the next provider.
  }
  if (!stop.aborted) {
    // Hosts here are fixed by this file, so this log cannot contain visitor or token data.
    logError("rpc_failed", {
      chain: call.chain,
      host: new URL(url).hostname,
      method: call.method,
      status: responseStatus,
      cause,
      ms: Date.now() - startedAt,
    });
  }
  return { ok: false };
}

/** Starts the next provider on failure or after a short delay, and keeps the first answer. */
function firstAnswer(fetchImpl: FetchLike, call: RpcCall): Promise<unknown> {
  const urls = RPC_URLS[call.chain];
  const stop = new AbortController();
  return new Promise((resolve, reject) => {
    let next = 0;
    let pending = 0;
    let isDone = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const launch = () => {
      clearTimeout(timer);
      if (isDone) return;
      if (next >= urls.length) {
        if (pending === 0) {
          isDone = true;
          reject(new ApiError("check_unavailable"));
        }
        return;
      }
      const url = urls[next]!;
      next += 1;
      pending += 1;
      timer = setTimeout(launch, HEDGE_DELAY_MS);
      void askProvider(fetchImpl, url, call, stop.signal).then((answer) => {
        pending -= 1;
        if (isDone) return;
        if (!answer.ok) {
          launch();
          return;
        }
        isDone = true;
        clearTimeout(timer);
        stop.abort();
        resolve(answer.value);
      });
    };
    launch();
  });
}

async function rpc(
  fetchImpl: FetchLike,
  chain: TokenChain,
  method: string,
  params: unknown[],
): Promise<unknown> {
  const call: RpcCall = { chain, method, params };
  const cached = await readCached(call);
  if (cached.ok) return cached.value;
  const value = await firstAnswer(fetchImpl, call);
  if (value !== null && value !== undefined) await writeCached(call, value);
  return value;
}

/** Decodes an ABI string, or the older bytes32 form that some tokens still use. */
export function decodeAbiString(hex: unknown): string {
  if (typeof hex !== "string" || !/^0x(?:[0-9a-fA-F]{2})*$/.test(hex)) return "";
  const bytes = Buffer.from(hex.slice(2), "hex");
  if (bytes.length === 32) {
    const end = bytes.indexOf(0);
    return bytes.subarray(0, end === -1 ? 32 : end).toString("utf8");
  }
  if (bytes.length < 64) return "";
  const offset = Number(bytes.readBigUInt64BE(24));
  if (!Number.isSafeInteger(offset) || offset + 32 > bytes.length) return "";
  const length = Number(bytes.readBigUInt64BE(offset + 24));
  if (!Number.isSafeInteger(length) || offset + 32 + length > bytes.length) return "";
  return bytes
    .subarray(offset + 32, offset + 32 + Math.min(length, MAX_TEXT_BYTES))
    .toString("utf8");
}

async function readEvmToken(
  fetchImpl: FetchLike,
  chain: TokenChain,
  address: string,
): Promise<TokenText> {
  const call = (data: string) =>
    rpc(fetchImpl, chain, "eth_call", [{ to: address, data }, "latest"]);
  const [name, symbol] = await Promise.all([call(ERC20_NAME), call(ERC20_SYMBOL)]);
  const text = { name: decodeAbiString(name), symbol: decodeAbiString(symbol), uri: "" };
  if (text.name || text.symbol) return text;

  // Only empty results need this extra request, which keeps usage of free endpoints low.
  const code = await rpc(fetchImpl, chain, "eth_getCode", [address, "latest"]);
  if (typeof code !== "string" || code === "0x") throw new ApiError("check_not_found");
  return text;
}

export function base58Decode(value: string): Uint8Array {
  let number = 0n;
  for (const character of value) {
    const digit = BASE58.indexOf(character);
    if (digit < 0) throw new ApiError("check_not_found");
    number = number * 58n + BigInt(digit);
  }
  const bytes: number[] = [];
  while (number > 0n) {
    bytes.unshift(Number(number & 255n));
    number >>= 8n;
  }
  for (const character of value) {
    if (character !== "1") break;
    bytes.unshift(0);
  }
  return Uint8Array.from(bytes);
}

export function base58Encode(bytes: Uint8Array): string {
  let number = 0n;
  for (const byte of bytes) number = (number << 8n) + BigInt(byte);
  let text = "";
  while (number > 0n) {
    text = BASE58[Number(number % 58n)] + text;
    number /= 58n;
  }
  for (const byte of bytes) {
    if (byte !== 0) break;
    text = `1${text}`;
  }
  return text;
}

const P = 2n ** 255n - 19n;
const modulo = (value: bigint) => ((value % P) + P) % P;
function power(base: bigint, exponent: bigint): bigint {
  let result = 1n;
  let current = modulo(base);
  for (let rest = exponent; rest > 0n; rest >>= 1n) {
    if (rest & 1n) result = modulo(result * current);
    current = modulo(current * current);
  }
  return result;
}
const inverse = (value: bigint) => power(value, P - 2n);
const D = modulo(-121665n * inverse(121666n));

/** Program addresses must not be valid ed25519 points. */
export function isOnCurve(bytes: Uint8Array): boolean {
  let y = 0n;
  for (let index = 31; index >= 0; index -= 1) y = (y << 8n) + BigInt(bytes[index]!);
  y &= 2n ** 255n - 1n;
  if (y >= P) return false;
  const y2 = modulo(y * y);
  const denominator = modulo(D * y2 + 1n);
  if (denominator === 0n) return false;
  const x2 = modulo(modulo(y2 - 1n) * inverse(denominator));
  return x2 === 0n || power(x2, (P - 1n) / 2n) === 1n;
}

export function metadataAddress(mint: Uint8Array): string {
  const program = base58Decode(METADATA_PROGRAM);
  for (let bump = 255; bump >= 0; bump -= 1) {
    const hash = createHash("sha256")
      .update(Buffer.from("metadata"))
      .update(program)
      .update(mint)
      .update(Uint8Array.of(bump))
      .update(program)
      .update(Buffer.from("ProgramDerivedAddress"))
      .digest();
    if (!isOnCurve(hash)) return base58Encode(hash);
  }
  throw new ApiError("check_unavailable");
}

/** Reads three length-prefixed strings. Malformed accounts produce empty text. */
export function readBorshText(data: Buffer, start: number): TokenText {
  const values: string[] = [];
  let offset = start;
  for (let index = 0; index < 3; index += 1) {
    if (offset + 4 > data.length) return EMPTY_TEXT;
    const length = data.readUInt32LE(offset);
    offset += 4;
    if (length > MAX_TEXT_BYTES || offset + length > data.length) return EMPTY_TEXT;
    values.push(
      data
        .subarray(offset, offset + length)
        .toString("utf8")
        .replace(/\0+$/, ""),
    );
    offset += length;
  }
  return { name: values[0]!, symbol: values[1]!, uri: values[2]! };
}

function token2022Text(data: Buffer): TokenText | null {
  const TLV_START = 166;
  const METADATA_EXTENSION = 19;
  let offset = TLV_START;
  while (offset + 4 <= data.length) {
    const type = data.readUInt16LE(offset);
    const length = data.readUInt16LE(offset + 2);
    if (type === 0) return null;
    if (type === METADATA_EXTENSION) return readBorshText(data, offset + 4 + 64);
    offset += 4 + length;
  }
  return null;
}

async function readAccount(fetchImpl: FetchLike, address: string) {
  const result = await rpc(fetchImpl, "solana", "getAccountInfo", [
    address,
    { encoding: "base64" },
  ]);
  if (!isRecord(result) || !isRecord(result.value)) return null;
  const { owner, data } = result.value;
  if (typeof owner !== "string" || !Array.isArray(data) || typeof data[0] !== "string") return null;
  return { owner, data: Buffer.from(data[0], "base64") };
}

async function readSolanaToken(fetchImpl: FetchLike, address: string): Promise<TokenText> {
  const bytes = base58Decode(address);
  if (bytes.length !== 32) throw new ApiError("check_not_found");
  const mint = await readAccount(fetchImpl, address);
  if (!mint || !TOKEN_PROGRAMS.has(mint.owner)) throw new ApiError("check_not_found");

  const metadata = await readAccount(fetchImpl, metadataAddress(bytes));
  if (metadata?.owner === METADATA_PROGRAM) return readBorshText(metadata.data, 65);
  return (mint.owner === TOKEN_2022 ? token2022Text(mint.data) : null) ?? EMPTY_TEXT;
}

const FIELD_BY_LINE = ["Token name", "Token symbol", "Metadata URI"];

export async function runTokenCheck(
  target: Extract<CheckTarget, { kind: "token" }>,
  context: CheckContext,
): Promise<CheckResult> {
  const chain = TOKEN_CHAINS[target.chain];
  const token =
    chain.family === "evm"
      ? await readEvmToken(context.fetch, target.chain, target.address)
      : await readSolanaToken(context.fetch, target.address);

  const lines = [token.name, token.symbol, token.uri].map((value) => value.replace(/\r?\n/g, " "));
  const signals: CheckSignal[] = scan([{ path: "CLAUDE.md", content: lines.join("\n") }])
    .findings.filter(
      (finding) => finding.ruleId.startsWith("INJ-") || finding.ruleId.startsWith("EXEC-"),
    )
    .map((finding) => findingSignal(finding, FIELD_BY_LINE[finding.line - 1] ?? "Token metadata"));

  if (!token.name && !token.symbol) {
    signals.push({
      severity: "info",
      title: "No on-chain name or symbol",
      detail: "There was no token text to inspect.",
    });
  }

  const label = token.symbol ? `${token.name || "Unnamed token"} (${token.symbol})` : token.name;
  return buildResult({
    target,
    kindLabel: `${chain.label} token metadata`,
    name: cleanText(label || "Unnamed token"),
    subtitle: target.address,
    sourceUrl: `${chain.explorer}${target.address}`,
    signals,
    statusLabels: STATUS_LABELS,
    notice: TOKEN_NOTICE,
    checked: [
      "On-chain token name and symbol",
      ...(chain.family === "solana" ? ["The metadata URI as text"] : []),
      "Hidden characters and instructions aimed at AI agents",
    ],
    notChecked: [
      "Contract code and permissions",
      "Liquidity, holders, and ownership",
      "Whether the token can be sold",
      "Price or investment risk",
      "Off-chain metadata, which is never fetched",
    ],
  });
}
