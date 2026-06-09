import { formatMoney, venueLabel } from '../../utils/dashboardFormat.js';
import { TrendBadge } from './TrendBadge.jsx';

export function VenuePerformanceTable({ rows, t, locale, currencyLabel, language, hideRevenue = false }) {
  if (!rows?.length) {
    return (
      <p className="px-6 py-10 text-center text-sm text-slate-500">{t('dashboard.noVenueData')}</p>
    );
  }

  const maxRevenue = hideRevenue
    ? 1
    : Math.max(...rows.map((r) => Number(r.revenueToday ?? 0)), 1);

  return (
    <div className="overflow-x-auto scrollbar-slim">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="text-start text-xs font-semibold uppercase tracking-wide text-slate-400">
            <th className="px-6 py-3 text-start font-semibold">{t('dashboard.venue')}</th>
            {!hideRevenue ? (
              <>
                <th className="px-6 py-3 text-start font-semibold">{t('metrics.revenueToday')}</th>
                <th className="px-6 py-3 text-start font-semibold">{t('dashboard.vsYesterday')}</th>
              </>
            ) : null}
            <th className="px-6 py-3 text-end font-semibold">{t('metrics.openTables')}</th>
            <th className="px-6 py-3 text-end font-semibold">{t('metrics.activeOrders')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const pct = hideRevenue
              ? 0
              : Math.max(4, Math.round((Number(row.revenueToday ?? 0) / maxRevenue) * 100));
            return (
              <tr
                key={row.venueId}
                className="border-t border-slate-100 transition-colors hover:bg-slate-50/70"
              >
                <td className="px-6 py-4 font-semibold text-slate-900">
                  {venueLabel(row, language)}
                </td>
                {!hideRevenue ? (
                  <>
                    <td className="px-6 py-4">
                      <div className="font-medium text-slate-800">
                        {formatMoney(row.revenueToday, locale, currencyLabel)}
                      </div>
                      <div className="mt-1.5 h-1.5 w-28 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-accent-gradient"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <TrendBadge
                        changePercent={row.changePercent}
                        changeAmount={row.changeAmount}
                        locale={locale}
                        currencyLabel={currencyLabel}
                        showAmount={false}
                      />
                    </td>
                  </>
                ) : null}
                <td className="px-6 py-4 text-end tabular-nums text-slate-700">{row.openTablesCount}</td>
                <td className="px-6 py-4 text-end tabular-nums text-slate-700">{row.activeOrders}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
