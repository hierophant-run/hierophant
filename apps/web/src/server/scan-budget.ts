import type { FetchLike } from "./github-client";

/** Some hosts cap outbound requests per visit, so a scan plans around that number. */
export class ScanBudget {
  private used = 0;

  constructor(private readonly limit: number) {}

  get remaining(): number {
    return Math.max(0, this.limit - this.used);
  }

  wrap(fetchImpl: FetchLike): FetchLike {
    return (input, init) => {
      if (this.used >= this.limit) return Promise.reject(new Error("Scan request budget used"));
      this.used += 1;
      return fetchImpl(input, init);
    };
  }
}
