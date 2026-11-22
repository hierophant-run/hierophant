import { LOGO_PATHS, SMALL_LOGO_MAX_SIZE } from "./logo-paths";

type LogoMarkProps = {
  size?: number;
  /** Accessible name. Omit when the mark is decorative. */
  title?: string;
  className?: string;
};

export function LogoMark({ size = 40, title, className }: LogoMarkProps) {
  const drawing = size <= SMALL_LOGO_MAX_SIZE ? "small" : "standard";
  const paths = LOGO_PATHS[drawing];
  const a11y = title ? { role: "img", "aria-label": title } : { "aria-hidden": true };

  return (
    <svg
      viewBox="0 0 96 96"
      width={size}
      height={size}
      className={className}
      data-drawing={drawing}
      focusable="false"
      {...a11y}
    >
      <path fill="currentColor" d={paths.blades} />
      <path style={{ fill: "var(--logo-dot, var(--dot))" }} d={paths.dot} />
    </svg>
  );
}
