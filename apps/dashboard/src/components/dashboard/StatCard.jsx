import { TrendBadge } from './TrendBadge.jsx';

export function StatCard({ label, value, hint, trend, className = '' }) {
  return (
    <div
      className={`rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm ${className}`}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-2">
        <p className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">{value}</p>
        {trend ? <TrendBadge {...trend} /> : null}
      </div>
      {hint ? <p className="mt-2 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}
