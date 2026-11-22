import type { TokenChain } from "./check-target";

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

const REQUEST_TIMEOUT_MS = 8_000;
const MAX_POOL_BYTES = 512 * 1024;
const MAX_INFO_BYTES = 128 * 1024;
const POOL_RESPONSE_LIMIT = 30;
const EARLIEST_POOL_MS = Date.UTC(2015, 0, 1);
const ONE_DAY_MS = 86_400_000;
const UNAVAILABLE = "Not available";

export type MarketRow = { label: string; value: string; note?: string };

export type PoolData = {
  count: number;
  isCapped: boolean;
  liquidityUsd: number | null;
  firstPoolAt: number | null;
};

export type TokenMarket = { holders: number | null; pools: PoolData | null };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

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

async function readLimitedJson(response: Response, maxBytes: number): Promise<unknown> {
  if (Number(response.headers.get("content-length") ?? "0") > maxBytes || !response.body) {
    await response.body?.cancel();
    return null;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return JSON.parse(text + decoder.decode());
    total += value.length;
    if (total > maxBytes) {
      await reader.cancel();
      return null;
    }
    text += decoder.decode(value, { stream: true });
  }
}

async function getJson(url: string, maxBytes: number): Promise<unknown> {
  try {
    const response = await fetch(url, {
      headers: { accept: "application/json" },
      credentials: "omit",
      referrerPolicy: "no-referrer",
      redirect: "error",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (response.ok) return await readLimitedJson(response, maxBytes);
    await response.body?.cancel();
  } catch {
    // These figures are optional, so a failed source only leaves its figure empty.
  }
  return null;
}

/** Runs in the visitor's browser, only after they ask for these figures. */
export async function loadTokenMarket(chain: TokenChain, address: string): Promise<TokenMarket> {
  const encoded = encodeURIComponent(address);
  const [poolBody, holderBody] = await Promise.all([
    getJson(
      `https://api.dexscreener.com/token-pairs/v1/${DEX_CHAINS[chain]}/${encoded}`,
      MAX_POOL_BYTES,
    ),
    getJson(
      `https://api.geckoterminal.com/api/v2/networks/${GECKO_NETWORKS[chain]}/tokens/${encoded}/info`,
      MAX_INFO_BYTES,
    ),
  ]);
  return { pools: parsePools(poolBody, chain, address), holders: parseHolders(holderBody) };
}

const wholeNumber = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const poolDate = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" });

function liquidityValue(pools: PoolData | null): string {
  if (!pools) return UNAVAILABLE;
  if (pools.count === 0) return "No pools found";
  return pools.liquidityUsd === null
    ? "Not reported"
    : `$${wholeNumber.format(pools.liquidityUsd)}`;
}

export function tokenMarketRows({ holders, pools }: TokenMarket): MarketRow[] {
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
