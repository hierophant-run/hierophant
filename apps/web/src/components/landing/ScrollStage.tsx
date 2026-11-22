"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { OrbFallback } from "./OrbFallback";

/** Horizontal and vertical travel of each file name, as a fraction of the viewport. */
const FILE_LABELS = [
  { name: "CLAUDE.md", x: -0.33, y: -0.27 },
  { name: ".cursor/rules", x: 0.27, y: -0.24 },
  { name: ".vscode/tasks.json", x: -0.38, y: 0.06 },
  { name: ".mcp.json", x: 0.36, y: -0.03 },
  { name: ".agents/hooks.json", x: -0.24, y: 0.33 },
  { name: "AGENTS.md", x: 0.05, y: -0.35 },
  { name: ".devcontainer.json", x: 0.26, y: 0.3 },
  { name: ".claude/settings.json", x: -0.04, y: 0.41 },
];

function supportsWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

function prefersStaticStage(): boolean {
  const device = navigator as Navigator & {
    deviceMemory?: number;
    connection?: { saveData?: boolean };
  };
  return (
    window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
    window.matchMedia("(max-height: 640px)").matches ||
    (navigator.hardwareConcurrency ?? 8) <= 2 ||
    (device.deviceMemory ?? 8) <= 2 ||
    device.connection?.saveData === true ||
    !supportsWebGL()
  );
}

const ENGAGEMENT_EVENTS = [
  "pointermove",
  "pointerdown",
  "touchstart",
  "keydown",
  "wheel",
  "scroll",
];

/** Waits for the visitor to engage so the animation never competes with the first load. */
function whenEngaged(callback: () => void): () => void {
  let idleId: number | undefined;
  let timer: number | undefined;

  const removeListeners = () => {
    ENGAGEMENT_EVENTS.forEach((name) => window.removeEventListener(name, trigger));
  };
  function trigger() {
    removeListeners();
    if (typeof window.requestIdleCallback === "function") {
      idleId = window.requestIdleCallback(callback, { timeout: 600 });
    } else {
      timer = window.setTimeout(callback, 100);
    }
  }

  ENGAGEMENT_EVENTS.forEach((name) => {
    window.addEventListener(name, trigger, { passive: true, once: true });
  });

  return () => {
    removeListeners();
    window.clearTimeout(timer);
    if (idleId !== undefined) window.cancelIdleCallback(idleId);
  };
}

export function ScrollStage({ hero, reveal }: { hero: ReactNode; reveal: ReactNode }) {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const stage = stageRef.current;
    const canvas = canvasRef.current;
    if (!stage || !canvas) return;

    if (prefersStaticStage()) {
      stage.dataset.static = "true";
      return;
    }

    let disposed = false;
    let cleanup = () => {};

    const fallBackToStatic = () => {
      cleanup();
      cleanup = () => {};
      delete stage.dataset.webgl;
      stage.dataset.static = "true";
    };
    const onContextLost = (event: Event) => {
      event.preventDefault();
      fallBackToStatic();
    };

    const start = async () => {
      try {
        const [{ createOrbScene }, { gsap }, { ScrollTrigger }] = await Promise.all([
          import("./orb-scene"),
          import("gsap"),
          import("gsap/ScrollTrigger"),
        ]);
        if (disposed) return;

        gsap.registerPlugin(ScrollTrigger);
        const scene = await createOrbScene(canvas);
        if (disposed) {
          scene.dispose();
          return;
        }
        canvas.addEventListener("webglcontextlost", onContextLost);
        stage.dataset.webgl = "ready";

        const context = gsap.context(() => {
          const timeline = gsap.timeline({
            defaults: { ease: "none" },
            scrollTrigger: {
              trigger: stage,
              start: "top top",
              end: "bottom bottom",
              scrub: 0.5,
              invalidateOnRefresh: true,
              onUpdate: (self) => scene.setProgress(self.progress),
            },
          });

          timeline.to("[data-stage-hero]", { autoAlpha: 0, y: -36, duration: 0.14 }, 0.08);

          gsap.utils.toArray<HTMLElement>("[data-file-label]").forEach((label, index) => {
            const x = Number(label.dataset.x);
            const y = Number(label.dataset.y);
            const toX = () => {
              const limit = Math.max(0, window.innerWidth / 2 - label.offsetWidth / 2 - 12);
              return gsap.utils.clamp(-limit, limit, x * window.innerWidth);
            };
            const toY = () => y * window.innerHeight;
            timeline.fromTo(
              label,
              { xPercent: -50, yPercent: -50, x: 0, y: 0, scale: 0.6, autoAlpha: 0 },
              { x: toX, y: toY, scale: 1, autoAlpha: 1, duration: 0.17 },
              0.38 + index * 0.012,
            );
            timeline.to(
              label,
              { x: () => toX() * 1.45, y: () => toY() * 1.45, autoAlpha: 0, duration: 0.12 },
              0.61 + index * 0.008,
            );
          });

          timeline.fromTo(
            "[data-stage-reveal]",
            { autoAlpha: 0, y: 28 },
            { autoAlpha: 1, y: 0, duration: 0.13 },
            0.76,
          );
          timeline.set({}, {}, 1);
        }, stage);

        const observer = new IntersectionObserver(([entry]) => {
          scene.setActive(entry?.isIntersecting ?? false);
        });
        observer.observe(stage);
        ScrollTrigger.refresh();

        cleanup = () => {
          observer.disconnect();
          canvas.removeEventListener("webglcontextlost", onContextLost);
          context.revert();
          scene.dispose();
        };
      } catch {
        if (!disposed) fallBackToStatic();
      }
    };

    const cancelWait = whenEngaged(() => void start());
    return () => {
      disposed = true;
      cancelWait();
      cleanup();
    };
  }, []);

  return (
    <div ref={stageRef} className="scroll-stage" data-testid="scroll-stage">
      <div className="scroll-stage__pin">
        <OrbFallback className="stage-fallback" />
        <canvas ref={canvasRef} className="stage-canvas" aria-hidden="true" />

        <div className="stage-files" aria-hidden="true">
          {FILE_LABELS.map((label) => (
            <span
              key={label.name}
              data-file-label
              data-x={label.x}
              data-y={label.y}
              className="stage-file border border-line bg-surface/85 px-2.5 py-1 font-mono text-xs text-text sm:text-sm"
            >
              {label.name}
            </span>
          ))}
        </div>

        <div className="stage-hero" data-stage-hero>
          {hero}
        </div>
        <div className="stage-reveal" data-stage-reveal>
          {reveal}
        </div>
      </div>
    </div>
  );
}
