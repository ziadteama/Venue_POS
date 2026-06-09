import { formatMoney, venueLabel } from '../../utils/dashboardFormat.js';
import { TrendBadge } from './TrendBadge.jsx';

export function VenuePerformanceTable({ rows, t, locale, currencyLabel, language }) {
  if (!rows?.length) {
    return (
      <p className="px-4 py-8 text-center text-sm text-slate-500">{t('dashboard.noVenueData')}</p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-start text-xs uppercase tracking-wide text-slate-500">
            <th className="px-4 py-3 font-semibold">{t('dashboard.venue')}</th>
            <th className="px-4 py-3 font-semibold">{t('metrics.revenueToday')}</th>
            <th className="px-4 py-3 font-semibold">{t('dashboard.vsYesterday')}</th>
            <th className="px-4 py-3 font-semibold">{t('metrics.openTables')}</th>
            <th className="px-4 py-3 font-semibold">{t('metrics.activeOrders')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.venueId} className="border-b border-slate-100 last:border-0">
              <td className="px-4 py-3 font-medium text-slate-900">
                {venueLabel(row, language)}
              </td>
              <td className="px-4 py-3 text-slate-800">
                {formatMoney(row.revenueToday, locale, currencyLabel)}
              </td>
              <td className="px-4 py-3">
                <TrendBadge
                  changePercent={row.changePercent}
                  changeAmount={row.changeAmount}
                  locale={locale}
                  currencyLabel={currencyLabel}
                />
              </td>
              <td className="px-4 py-3 text-slate-700">{row.openTablesCount}</td>
              <td className="px-4 py-3 text-slate-700">{row.activeOrders}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
