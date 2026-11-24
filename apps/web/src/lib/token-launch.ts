export type TokenLaunch = {
  /** The one official contract address. */
  address: string;
  /** Network name as people know it. */
  network: string;
  /** The address page on the network's block explorer. */
  explorerUrl: string;
  /** Where the token launched, if there is a public page for it. */
  launchUrl: string | null;
  launchLabel: string | null;
};

/** Null until launch. Fill in every field from the official launch post. */
export const TOKEN_LAUNCH: TokenLaunch | null = null;

export const isEvmAddress = (value: string) => /^0x[0-9a-fA-F]{40}$/.test(value);

export const isHttpsUrl = (value: string) => {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
};
