import { formatMoney, venueLabel } from '../../../utils/dashboardFormat.js';

export function VenueComparisonBars({ rows, t, locale, currencyLabel, language, hideFinancials }) {
  if (hideFinancials || !rows?.length) {
    return <p className="text-sm text-slate-500">{t('dashboard.noVenueData')}</p>;
  }

  const max = Math.max(...rows.map((r) => Number(r.netRevenueToday ?? 0)), 1);

  return (
    <div className="space-y-4">
      {rows.slice(0, 6).map((row) => {
        const pct = Math.max(6, Math.round((Number(row.netRevenueToday ?? 0) / max) * 100));
        return (
          <div key={row.venueId}>
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="truncate font-medium text-slate-800">{venueLabel(row, language)}</span>
              <span className="shrink-0 font-semibold tabular-nums text-slate-900">
                {formatMoney(row.netRevenueToday, locale, currencyLabel)}
              </span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-accent-gradient" style={{ width: `${pct}%` }} />
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {t('dashboard.revenueContribution', {
                percent: max > 0 ? Math.round((Number(row.netRevenueToday ?? 0) / rows.reduce((s, r) => s + Number(r.netRevenueToday ?? 0), 0)) * 100) : 0,
              })}
            </p>
          </div>
        );
      })}
    </div>
  );
}
