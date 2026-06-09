import { useCountUp } from '../../hooks/useCountUp.js';

/**
 * Renders a smoothly counting number. `format` receives the live numeric value
 * and returns the display string (money, integer, etc.).
 */
export function AnimatedNumber({ value, format, duration = 900 }) {
  const animated = useCountUp(value, { duration });
  const display = format ? format(animated) : Math.round(animated).toLocaleString();
  return <span>{display}</span>;
}
