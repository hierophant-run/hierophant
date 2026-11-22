import { afterEach, describe, expect, it, vi } from "vitest";
import { loadTokenMarket, parseHolders, parsePools, tokenMarketRows } from "./token-market";

const address = `0x${"a".repeat(40)}`;
const pool = (usd: number | null, createdAt: number, overrides = {}) => ({
  chainId: "base",
  baseToken: { address: address.toUpperCase().replace("0X", "0x") },
  quoteToken: { address: `0x${"c".repeat(40)}` },
  ...(usd === null ? {} : { liquidity: { usd } }),
  pairCreatedAt: createdAt,
  ...overrides,
});
const rowsOf = (market: Parameters<typeof tokenMarketRows>[0]) =>
  Object.fromEntries(tokenMarketRows(market).map((row) => [row.label, row.value]));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("token market data", () => {
  it("adds only pools for this token on this chain", () => {
    const pools = parsePools(
      [
        pool(1000.4, Date.UTC(2024, 0, 2)),
        pool(500, Date.UTC(2023, 5, 1)),
        pool(99999, Date.UTC(2020, 0, 1), { chainId: "ethereum" }),
        pool(99999, Date.UTC(2020, 0, 1), { baseToken: { address: `0x${"d".repeat(40)}` } }),
      ],
      "base",
      address,
    );
    expect(rowsOf({ pools, holders: 1234 })).toEqual({
      Holders: "1,234",
      "DEX liquidity": "$1,500",
      "DEX pools": "2",
      "First pool seen": "Jun 1, 2023",
    });
  });

  it("rejects malformed figures", () => {
    const pools = parsePools(
      [pool(-5, Number.NaN), pool(Number.POSITIVE_INFINITY, 12)],
      "base",
      address,
    );
    expect(
      rowsOf({ pools, holders: parseHolders({ data: { attributes: { holders: {} } } }) }),
    ).toMatchObject({
      Holders: "Not available",
      "DEX liquidity": "Not reported",
      "First pool seen": "Not available",
    });
    expect(parsePools({ error: true }, "base", address)).toBeNull();
    expect(parseHolders({ data: { attributes: { holders: { count: "many" } } } })).toBeNull();
  });

  it("marks a capped pool list as a partial total", () => {
    const pools = parsePools(
      Array.from({ length: 30 }, () => pool(10, Date.UTC(2024, 0, 1))),
      "base",
      address,
    );
    const rows = tokenMarketRows({ pools, holders: null });
    expect(rows.find((row) => row.label === "DEX pools")?.value).toBe("30+");
    expect(rows.find((row) => row.label === "DEX liquidity")?.note).toContain("may be higher");
  });

  it("requests without credentials or a referrer", async () => {
    const fetchSpy = vi.fn(async (url: string) =>
      url.includes("dexscreener")
        ? new Response(JSON.stringify([pool(10, Date.UTC(2024, 0, 1))]))
        : new Response(JSON.stringify({ data: { attributes: { holders: { count: 7 } } } })),
    );
    vi.stubGlobal("fetch", fetchSpy);
    const market = await loadTokenMarket("base", address);
    expect(market.holders).toBe(7);
    expect(market.pools?.count).toBe(1);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    for (const [, init] of fetchSpy.mock.calls as unknown as Array<[string, RequestInit]>) {
      expect(init).toMatchObject({
        credentials: "omit",
        referrerPolicy: "no-referrer",
        redirect: "error",
      });
    }
  });

  it("leaves a figure empty when its source fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("dexscreener")) return new Response("{}", { status: 429 });
        throw new TypeError("blocked");
      }),
    );
    expect(await loadTokenMarket("base", address)).toEqual({ pools: null, holders: null });
  });

  it("rejects an oversized response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () => new Response("[]", { headers: { "content-length": String(10 * 1024 * 1024) } }),
      ),
    );
    expect(await loadTokenMarket("base", address)).toEqual({ pools: null, holders: null });
  });
});
