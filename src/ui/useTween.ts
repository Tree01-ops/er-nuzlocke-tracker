import { useEffect, useRef, useState } from "react";

/** Gentle overshoot, so values "spring" into place. */
export const easeOutBack = (t: number) => {
  const c = 1.4;
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
};
export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

/**
 * Animates a list of numbers toward `target` whenever it changes, continuing from wherever
 * the previous animation was. With `fromZero`, the first render grows in from 0.
 * Jumps straight to the target when the user prefers reduced motion.
 */
export function useTween(target: number[], { ms = 450, ease = easeOutCubic, fromZero = false } = {}): number[] {
  const [shown, setShown] = useState(() => (fromZero ? target.map(() => 0) : target));
  const from = useRef(shown);
  const key = target.join(",");
  useEffect(() => {
    const start = from.current;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      from.current = target;
      setShown(target);
      return;
    }
    const t0 = performance.now();
    let frame = requestAnimationFrame(function step(now) {
      const t = Math.min(1, (now - t0) / ms);
      const k = ease(t);
      const next = target.map((v, i) => (start[i] ?? 0) + (v - (start[i] ?? 0)) * k);
      from.current = next; // a switch mid-animation continues from the current values
      setShown(next);
      if (t < 1) frame = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(frame);
    // Only restart when the values change, not when a new array with the same values arrives.
  }, [key]);
  return shown;
}
