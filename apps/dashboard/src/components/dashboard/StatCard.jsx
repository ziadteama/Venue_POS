import { TrendBadge } from './TrendBadge.jsx';
import { Sparkline } from './Sparkline.jsx';
import { AnimatedNumber } from './AnimatedNumber.jsx';

const TONES = {
  emerald: {
    icon: 'bg-accent-50 text-accent-600 ring-accent-100',
    spark: '#10b981',
  },
  blue: {
    icon: 'bg-blue-50 text-blue-600 ring-blue-100',
    spark: '#2563eb',
  },
  violet: {
    icon: 'bg-violet-50 text-violet-600 ring-violet-100',
    spark: '#7c3aed',
  },
  amber: {
    icon: 'bg-amber-50 text-amber-600 ring-amber-100',
    spark: '#d97706',
  },
};

/**
 * Premium KPI card: icon chip, trend pill, animated counter, and an optional
 * sparkline footer. Lifts gently on hover when interactive.
 */
export function StatCard({
  label,
  value,
  amount,
  format,
  hint,
  trend,
  icon: Icon,
  tone = 'emerald',
  spark,
  className = '',
  onClick,
  interactive = true,
}) {
  const t = TONES[tone] ?? TONES.emerald;
  const isButton = Boolean(onClick) && interactive;
  const surfaceClass = isButton
    ? 'surface-card-interactive group w-full cursor-pointer p-5 text-start focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-2'
    : interactive
      ? 'surface-card-interactive group p-5'
      : 'surface-card p-5';

  const inner = (
    <>
      <div className="flex items-start justify-between gap-3">
        {Icon ? (
          <span className={`flex h-10 w-10 items-center justify-center rounded-xl ring-1 ${t.icon}`}>
            <Icon className="h-5 w-5" />
          </span>
        ) : (
          <span />
        )}
        {trend ? <TrendBadge {...trend} /> : null}
      </div>

      <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <div className="mt-1.5 text-2xl font-semibold tracking-tight text-slate-900 sm:text-[1.75rem]">
        {amount != null ? <AnimatedNumber value={amount} format={format} /> : value}
      </div>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}

      {spark?.length ? (
        <div className="mt-4 -mb-1">
          <Sparkline data={spark} stroke={t.spark} height={44} />
        </div>
      ) : null}
    </>
  );

  if (isButton) {
    return (
      <button type="button" onClick={onClick} className={`${surfaceClass} ${className}`}>
        {inner}
      </button>
    );
  }

  return <div className={`${surfaceClass} ${className}`}>{inner}</div>;
}
