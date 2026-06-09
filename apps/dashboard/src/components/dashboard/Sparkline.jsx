import { useId } from 'react';

/**
 * Compact SVG sparkline with a soft gradient fill. Pure SVG (no chart lib) so
 * it stays crisp and cheap inside KPI cards.
 */
export function Sparkline({
  data = [],
  width = 220,
  height = 48,
  stroke = '#10b981',
  className = '',
}) {
  const gradientId = useId();
  const values = (data ?? []).map((d) => (typeof d === 'number' ? d : Number(d?.value ?? d?.revenue ?? 0)));

  if (values.length < 2) {
    return <div className={`h-12 ${className}`} aria-hidden="true" />;
  }

  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const pad = 3;
  const stepX = (width - pad * 2) / (values.length - 1);

  const points = values.map((v, i) => {
    const x = pad + i * stepX;
    const y = pad + (1 - (v - min) / range) * (height - pad * 2);
    return [x, y];
  });

  const line = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${line} L${points[points.length - 1][0].toFixed(1)},${height} L${points[0][0].toFixed(1)},${height} Z`;
  const last = points[points.length - 1];

  return (
    <svg
      className={`w-full ${className}`}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.22" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradientId})`} />
      <path d={line} fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r="2.6" fill="#fff" stroke={stroke} strokeWidth="2" />
    </svg>
  );
}
