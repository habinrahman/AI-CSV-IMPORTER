"use client";

import { useEffect, useRef } from "react";
import { animate, useReducedMotion } from "framer-motion";

interface AnimatedNumberProps {
  value: number;
  /** Formats the displayed value (defaults to locale grouping). */
  format?: (value: number) => string;
  className?: string;
}

/**
 * Counts up to `value` on mount/change. Users with reduced-motion get the
 * final number immediately — the animation is decoration, never information.
 */
export function AnimatedNumber({ value, format, className }: AnimatedNumberProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduceMotion = useReducedMotion();
  const render = format ?? ((n: number) => Math.round(n).toLocaleString());

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (reduceMotion) {
      node.textContent = render(value);
      return;
    }
    const controls = animate(0, value, {
      duration: 0.6,
      ease: "easeOut",
      onUpdate: (latest) => {
        node.textContent = render(latest);
      },
    });
    return () => controls.stop();
    // `render` is intentionally excluded: inline format closures would
    // restart the animation on every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, reduceMotion]);

  // Initial text keeps SSR/first paint meaningful before the effect runs.
  return (
    <span ref={ref} className={className}>
      {render(reduceMotion ? value : 0)}
    </span>
  );
}
