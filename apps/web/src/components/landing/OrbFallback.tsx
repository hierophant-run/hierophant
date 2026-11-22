import { useId } from "react";
import { LOGO_PATHS } from "@/components/brand/logo-paths";

/** Static orb for first paint, reduced motion, and devices without WebGL. */
export function OrbFallback({ className }: { className?: string }) {
  const id = useId();
  const glow = `${id}-glow`;
  const dot = `${id}-dot`;

  return (
    <svg viewBox="0 0 96 96" className={className} aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id={glow} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#061519" stopOpacity="0" />
          <stop offset="72%" stopColor="#123a3b" stopOpacity="0.2" />
          <stop offset="94%" stopColor="#7fc7b5" stopOpacity="0.32" />
          <stop offset="100%" stopColor="#7fc7b5" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={dot} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#f6d98b" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#f6d98b" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="48" cy="48" r="47" fill={`url(#${glow})`} />
      <circle
        cx="48"
        cy="48"
        r="44.5"
        fill="none"
        stroke="#7fc7b5"
        strokeOpacity="0.28"
        strokeWidth="0.3"
        strokeDasharray="0.4 1.1"
      />
      <g transform="translate(16.32 16.32) scale(0.66)">
        <path fill="#f2efe4" fillOpacity="0.9" d={LOGO_PATHS.standard.blades} />
        <circle cx="48" cy="59" r="15" fill={`url(#${dot})`} />
        <path fill="#f6d98b" d={LOGO_PATHS.standard.dot} />
      </g>
    </svg>
  );
}
