import { useEffect, useRef, useState } from 'react';

/**
 * Animates a number from its previous value to `target` with an ease-out curve.
 * Respects reduced-motion preferences by snapping straight to the target.
 */
export function useCountUp(target, { duration = 900 } = {}) {
  const numericTarget = Number.isFinite(Number(target)) ? Number(target) : 0;
  const [value, setValue] = useState(numericTarget);
  const fromRef = useRef(numericTarget);
  const rafRef = useRef(null);

  useEffect(() => {
    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;

    const from = fromRef.current;
    const to = numericTarget;

    if (prefersReduced || from === to) {
      fromRef.current = to;
      setValue(to);
      return undefined;
    }

    const start = performance.now();
    const step = (now) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(from + (to - from) * eased);
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        fromRef.current = to;
      }
    };

    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      fromRef.current = to;
    };
  }, [numericTarget, duration]);

  return value;
}
