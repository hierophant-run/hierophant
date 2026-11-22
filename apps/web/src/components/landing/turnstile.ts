const SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
const CHALLENGE_TIMEOUT_MS = 60_000;

type TurnstileOptions = {
  sitekey: string;
  theme: "dark";
  appearance: "interaction-only";
  callback: (token: string) => void;
  "error-callback": () => boolean;
  "expired-callback": () => void;
  "timeout-callback": () => void;
};

type TurnstileApi = {
  render: (container: HTMLElement, options: TurnstileOptions) => string;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let loader: Promise<TurnstileApi> | null = null;

/** Loaded only after a visitor starts using the form, so a plain page view contacts no third party. */
export function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  loader ??= new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_URL;
    script.async = true;
    script.onload = () => {
      if (window.turnstile) resolve(window.turnstile);
      else reject(new Error("Turnstile did not load"));
    };
    script.onerror = () => {
      script.remove();
      loader = null;
      reject(new Error("Turnstile did not load"));
    };
    document.head.append(script);
  });
  return loader;
}

/** Tokens are single-use, so each scan renders its own widget and removes it afterwards. */
export async function requestTurnstileToken(
  siteKey: string,
  container: HTMLElement,
): Promise<string> {
  const api = await loadTurnstile();

  return new Promise<string>((resolve, reject) => {
    let widgetId: string | undefined;
    const finish = (settle: () => void) => {
      window.clearTimeout(timer);
      if (widgetId !== undefined) api.remove(widgetId);
      widgetId = undefined;
      settle();
    };
    const fail = () => finish(() => reject(new Error("Turnstile failed")));
    const timer = window.setTimeout(fail, CHALLENGE_TIMEOUT_MS);

    widgetId = api.render(container, {
      sitekey: siteKey,
      theme: "dark",
      appearance: "interaction-only",
      callback: (token) => finish(() => resolve(token)),
      "error-callback": () => {
        fail();
        return true;
      },
      "expired-callback": fail,
      "timeout-callback": fail,
    });
  });
}
