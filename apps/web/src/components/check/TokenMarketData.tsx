"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Eyebrow } from "@/components/ui/Eyebrow";
import type { TokenChain } from "@/lib/check-target";
import { loadTokenMarket, tokenMarketRows, type TokenMarket } from "@/lib/token-market";
import { DetailRows } from "./DetailRows";

export function TokenMarketData({ chain, address }: { chain: TokenChain; address: string }) {
  const [market, setMarket] = useState<TokenMarket | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const isIncomplete = market !== null && (market.holders === null || market.pools === null);

  const load = async () => {
    setIsLoading(true);
    setMarket(await loadTokenMarket(chain, address));
    setIsLoading(false);
  };

  return (
    <section aria-labelledby="market-title" className="mt-14">
      <Eyebrow>Context</Eyebrow>
      <h2 id="market-title" className="mt-3 text-2xl font-medium tracking-tight sm:text-4xl">
        Public token data
      </h2>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">
        Holder and DEX liquidity figures from third parties. They can be wrong or manipulated. They
        do not affect the result above and are not a safety rating or buy signal.
      </p>

      {market ? <DetailRows rows={tokenMarketRows(market)} /> : null}

      <div aria-live="polite">
        {isIncomplete && !isLoading ? (
          <p className="mt-4 text-sm leading-6 text-muted">
            Some figures could not be loaded. The source may be busy.
          </p>
        ) : null}
      </div>

      {!market || isIncomplete ? (
        <div className="mt-5">
          <Button type="button" variant="secondary" disabled={isLoading} onClick={load}>
            {isLoading ? "Loading" : market ? "Try again" : "Load public token data"}
          </Button>
          {market ? null : (
            <p className="mt-3 max-w-2xl text-xs leading-5 text-muted">
              Your browser will connect directly to DexScreener and GeckoTerminal. They will receive
              your IP address and this token address.
            </p>
          )}
        </div>
      ) : null}
    </section>
  );
}
