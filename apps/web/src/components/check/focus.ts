const FOCUS_TIMEOUT_MS = 2500;

const formInput = () => document.querySelector<HTMLElement>("#scan-url, #check-value");

function focusWhenVisible(input: HTMLElement) {
  const hero = input.closest("[data-stage-hero]") ?? input;
  const startedAt = performance.now();

  // The form fades out during the scroll animation, so wait until it is back on screen.
  const attempt = () => {
    const style = getComputedStyle(hero);
    const isAtTop = window.scrollY < 2 || !input.closest("[data-stage-hero]");
    if (isAtTop && style.visibility !== "hidden" && Number(style.opacity) > 0.5) {
      input.focus({ preventScroll: true });
    } else if (performance.now() - startedAt < FOCUS_TIMEOUT_MS) {
      requestAnimationFrame(attempt);
    }
  };
  attempt();
}

/** Moves to the check form on this page. Returns false when the page has no form. */
export function goToCheckForm(): boolean {
  const input = formInput();
  if (!input) return false;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
  focusWhenVisible(input);
  return true;
}
