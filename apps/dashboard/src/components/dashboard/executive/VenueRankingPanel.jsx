import { Link } from 'react-router-dom';
import { SectionCard } from '../../ui/Card.jsx';
import { TrendBadge } from '../TrendBadge.jsx';
import { ArrowUpRightIcon } from '../icons.jsx';
import { formatMoney, venueLabel } from '../../../utils/dashboardFormat.js';

function VenueHighlight({ label, venue, locale, currencyLabel, language, t, tone }) {
  if (!venue) return null;
  const isTop = tone === 'top';

  return (
    <div
      className={`rounded-2xl border p-4 ring-1 ${
        isTop
          ? 'border-accent-200/80 bg-gradient-to-br from-accent-50 to-white ring-accent-100'
          : 'border-amber-200/80 bg-gradient-to-br from-amber-50/80 to-white ring-amber-100'
      }`}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-lg font-semibold tracking-tight text-slate-900">
        {venueLabel(venue, language)}
      </p>
      <p className="mt-1 text-sm font-medium text-slate-700">
        {formatMoney(venue.netRevenueToday, locale, currencyLabel)}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <span>{t('dashboard.transactionsToday', { count: venue.transactionCount ?? 0 })}</span>
        {venue.changePercent != null ? (
          <TrendBadge
            changePercent={venue.changePercent}
            locale={locale}
            currencyLabel={currencyLabel}
            showAmount={false}
          />
        ) : null}
      </div>
    </div>
  );
}

export function VenueRankingPanel({
  id,
  ranking,
  t,
  locale,
  currencyLabel,
  language,
  hideFinancials,
  venueId,
  onSelectVenue,
}) {
  const rows = ranking?.venues ?? [];
  const maxRevenue = hideFinancials
    ? 1
    : Math.max(...rows.map((r) => Number(r.netRevenueToday ?? 0)), 1);

  return (
    <SectionCard
      id={id}
      className="scroll-mt-24"
      title={t('dashboard.venueRankingTitle')}
      hint={t('dashboard.venueRankingHint')}
      flush
      action={
        !hideFinancials ? (
          <Link
            to={venueId ? `/analytics?venueId=${encodeURIComponent(venueId)}` : '/analytics'}
            className="inline-flex items-center gap-1 text-xs font-semibold text-accent-600 transition hover:text-accent-700"
          >
            {t('dashboard.viewAnalytics')}
            <ArrowUpRightIcon className="h-3.5 w-3.5" />
          </Link>
        ) : null
      }
    >
      {!rows.length ? (
        <p className="px-6 py-10 text-center text-sm text-slate-500">{t('dashboard.noVenueData')}</p>
      ) : (
        <div className="space-y-6 px-6 py-5">
          {!hideFinancials && rows.length > 1 ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <VenueHighlight
                label={t('dashboard.topVenue')}
                venue={ranking.topVenue}
                locale={locale}
                currencyLabel={currencyLabel}
                language={language}
                t={t}
                tone="top"
              />
              <VenueHighlight
                label={t('dashboard.bottomVenue')}
                venue={ranking.bottomVenue}
                locale={locale}
                currencyLabel={currencyLabel}
                language={language}
                t={t}
                tone="bottom"
              />
            </div>
          ) : null}

          <div className="space-y-2">
            {rows.map((row, index) => {
              const pct = hideFinancials
                ? 0
                : Math.max(4, Math.round((Number(row.netRevenueToday ?? 0) / maxRevenue) * 100));
              return (
                <button
                  key={row.venueId}
                  type="button"
                  onClick={() => onSelectVenue?.(row.venueId)}
                  className="group flex w-full items-center gap-4 rounded-xl border border-transparent px-3 py-3 text-start transition hover:border-slate-200 hover:bg-slate-50/80"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs font-bold text-slate-600 group-hover:bg-white">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-semibold text-slate-900">{venueLabel(row, language)}</p>
                      {!hideFinancials ? (
                        <p className="text-sm font-semibold tabular-nums text-slate-800">
                          {formatMoney(row.netRevenueToday, locale, currencyLabel)}
                        </p>
                      ) : null}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                      {!hideFinancials ? (
                        <>
                          <span>{t('dashboard.transactionsToday', { count: row.transactionCount ?? 0 })}</span>
                          <span>
                            {t('dashboard.avgCheque')}:{' '}
                            {formatMoney(row.avgChequeValue, locale, currencyLabel)}
                          </span>
                          {row.weekGrowthPercent != null ? (
                            <TrendBadge
                              changePercent={row.weekGrowthPercent}
                              locale={locale}
                              currencyLabel={currencyLabel}
                              showAmount={false}
                            />
                          ) : null}
                        </>
                      ) : null}
                      <span>{t('metrics.openTables')}: {row.openTablesCount ?? 0}</span>
                      <span>{t('metrics.activeOrders')}: {row.activeOrders ?? 0}</span>
                    </div>
                    {!hideFinancials ? (
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-accent-gradient transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </SectionCard>
  );
}
