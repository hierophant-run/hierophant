import type { TokenChain } from "@/lib/check-target";
import type { FetchLike } from "../github-client";
import { logError } from "../log";
import { fetchJson, isRecord, type CheckDetail } from "./common";

const DEX_CHAINS: Record<TokenChain, string> = {
  ethereum: "ethereum",
  base: "base",
  arbitrum: "arbitrum",
  optimism: "optimism",
  polygon: "polygon",
  bsc: "bsc",
  robinhood: "robinhood",
  solana: "solana",
};

const GECKO_NETWORKS: Record<TokenChain, string> = {
  ethereum: "eth",
  base: "base",
  arbitrum: "arbitrum",
  optimism: "optimism",
  polygon: "polygon_pos",
  bsc: "bsc",
  robinhood: "robinhood",
  solana: "solana",
};

const REQUEST_TIMEOUT_MS = 3_000;
const CACHE_SECONDS = 900;
const CACHE_ORIGIN = "https://hierophanthq.com/__token-data-cache/";
const MAX_POOL_BYTES = 512 * 1024;
const MAX_INFO_BYTES = 128 * 1024;
const POOL_RESPONSE_LIMIT = 30;
const EARLIEST_POOL_MS = Date.UTC(2015, 0, 1);
const ONE_DAY_MS = 86_400_000;

export type PoolData = {
  count: number;
  isCapped: boolean;
  liquidityUsd: number | null;
  firstPoolAt: number | null;
};

export type TokenData = { holders: number | null; pools: PoolData | null };

const edgeCache = () =>
  (globalThis as unknown as { caches?: { default?: Cache } }).caches?.default ?? null;

async function cached<T>(key: string, load: () => Promise<T | null>): Promise<T | null> {
  const request = new Request(`${CACHE_ORIGIN}${key}`);
  try {
    const hit = await edgeCache()?.match(request);
    if (hit) return ((await hit.json()) as { value: T }).value;
  } catch {
    // A cache failure only means the source is asked again.
  }
  const value = await load();
  if (value === null) return null;
  try {
    await edgeCache()?.put(
      request,
      new Response(JSON.stringify({ value }), {
        headers: {
          "cache-control": `public, max-age=${CACHE_SECONDS}`,
          "content-type": "application/json",
        },
      }),
    );
  } catch {
    // The cache only saves requests, so a failed write changes nothing.
  }
  return value;
}

async function getJson(
  fetchImpl: FetchLike,
  source: string,
  chain: TokenChain,
  url: string,
  maxBytes: number,
): Promise<unknown> {
  let status = 0;
  try {
    const response = await fetchJson(
      fetchImpl,
      url,
      {
        headers: { accept: "application/json", "user-agent": "hierophant" },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      },
      maxBytes,
    );
    status = response.status;
    if (status === 200) return response.body;
  } catch {
    // These figures are optional, so the check continues without them.
  }
  logError("token_data_failed", { source, chain, status });
  return null;
}

const sameAddress = (chain: TokenChain, left: unknown, right: string) =>
  typeof left === "string" &&
  (chain === "solana" ? left === right : left.toLowerCase() === right.toLowerCase());

export function parsePools(body: unknown, chain: TokenChain, address: string): PoolData | null {
  if (!Array.isArray(body)) return null;
  const pools = body.filter(
    (pool): pool is Record<string, unknown> =>
      isRecord(pool) &&
      pool.chainId === DEX_CHAINS[chain] &&
      ((isRecord(pool.baseToken) && sameAddress(chain, pool.baseToken.address, address)) ||
        (isRecord(pool.quoteToken) && sameAddress(chain, pool.quoteToken.address, address))),
  );

  const liquidity = pools.flatMap((pool) => {
    const usd = isRecord(pool.liquidity) ? pool.liquidity.usd : null;
    return typeof usd === "number" && Number.isFinite(usd) && usd >= 0 ? [usd] : [];
  });
  const latest = Date.now() + ONE_DAY_MS;
  const created = pools.flatMap((pool) => {
    const time = pool.pairCreatedAt;
    return typeof time === "number" &&
      Number.isSafeInteger(time) &&
      time >= EARLIEST_POOL_MS &&
      time <= latest
      ? [time]
      : [];
  });

  return {
    count: pools.length,
    isCapped: body.length >= POOL_RESPONSE_LIMIT,
    liquidityUsd: liquidity.length ? liquidity.reduce((sum, usd) => sum + usd, 0) : null,
    firstPoolAt: created.length ? Math.min(...created) : null,
  };
}

export function parseHolders(body: unknown): number | null {
  if (!isRecord(body) || !isRecord(body.data) || !isRecord(body.data.attributes)) return null;
  const { holders } = body.data.attributes;
  if (!isRecord(holders)) return null;
  const { count } = holders;
  return typeof count === "number" && Number.isSafeInteger(count) && count >= 0 ? count : null;
}

/** Reads optional market figures. A failed source leaves its figure empty. */
export async function readTokenData(
  fetchImpl: FetchLike,
  chain: TokenChain,
  address: string,
): Promise<TokenData> {
  const encoded = encodeURIComponent(address);
  const [pools, holders] = await Promise.all([
    cached(`pools/${chain}/${encoded}`, async () =>
      parsePools(
        await getJson(
          fetchImpl,
          "dexscreener",
          chain,
          `https://api.dexscreener.com/token-pairs/v1/${DEX_CHAINS[chain]}/${encoded}`,
          MAX_POOL_BYTES,
        ),
        chain,
        address,
      ),
    ),
    cached(`holders/${chain}/${encoded}`, async () =>
      parseHolders(
        await getJson(
          fetchImpl,
          "geckoterminal",
          chain,
          `https://api.geckoterminal.com/api/v2/networks/${GECKO_NETWORKS[chain]}/tokens/${encoded}/info`,
          MAX_INFO_BYTES,
        ),
      ),
    ),
  ]);
  return { holders, pools };
}

const wholeNumber = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const poolDate = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" });
const UNAVAILABLE = "Not available";

function liquidityValue(pools: PoolData | null): string {
  if (!pools) return UNAVAILABLE;
  if (pools.count === 0) return "No pools found";
  return pools.liquidityUsd === null
    ? "Not reported"
    : `$${wholeNumber.format(pools.liquidityUsd)}`;
}

export function tokenDataRows({ holders, pools }: TokenData): CheckDetail[] {
  return [
    {
      label: "Holders",
      value: holders === null ? UNAVAILABLE : wholeNumber.format(holders),
      note: "Reported by GeckoTerminal.",
    },
    {
      label: "DEX liquidity",
      value: liquidityValue(pools),
      note: pools?.isCapped
        ? "Sum of the 30 pools returned by DexScreener. The full total may be higher."
        : "Sum of the pools reported by DexScreener.",
    },
    {
      label: "DEX pools",
      value: pools ? `${wholeNumber.format(pools.count)}${pools.isCapped ? "+" : ""}` : UNAVAILABLE,
      note: "Reported by DexScreener.",
    },
    {
      label: "First pool seen",
      value: pools?.firstPoolAt ? poolDate.format(new Date(pools.firstPoolAt)) : UNAVAILABLE,
      note: "Oldest pool returned. This is not the contract deployment date.",
    },
  ];
}
