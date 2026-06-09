import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { isHubStaff } from '@venue-pos/shared';
import { apiFetch } from '../api/client.js';
import { friendlyError } from '../utils/apiError.js';
import { useAuth } from '../hooks/useAuth.js';
import { useMetricsSocket } from '../hooks/useMetricsSocket.js';
import { PageHeader } from '../components/dashboard/PageHeader.jsx';
import { StatCard } from '../components/dashboard/StatCard.jsx';
import { MiniBarChart } from '../components/dashboard/MiniBarChart.jsx';
import { VenuePerformanceTable } from '../components/dashboard/VenuePerformanceTable.jsx';
import { RecentActivityFeed } from '../components/dashboard/RecentActivityFeed.jsx';
import { formatMoney, formatShortDate } from '../utils/dashboardFormat.js';

export function DashboardHome() {
  const { t, i18n } = useTranslation();
  const { user, token } = useAuth();
  const [summary, setSummary] = useState(null);
  const [venueId, setVenueId] = useState('');
  const [venues, setVenues] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [liveUpdates, setLiveUpdates] = useState(false);

  const locale = i18n.language === 'ar' ? 'ar-EG' : 'en-EG';
  const currencyLabel = t('pos.currency');
  const canPickVenue = isHubStaff(user?.role);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    setLiveUpdates(false);
    try {
      const q = venueId ? `?venueId=${encodeURIComponent(venueId)}` : '';
      const [data, venueList] = await Promise.all([
        apiFetch(`/api/v1/manager/dashboard/executive${q}`),
        canPickVenue ? apiFetch('/api/v1/venues') : Promise.resolve([]),
      ]);
      setSummary(data);
      if (canPickVenue) setVenues(Array.isArray(venueList) ? venueList : []);
      setLiveUpdates(true);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setLoading(false);
    }
  }, [venueId, canPickVenue]);

  useEffect(() => {
    load();
  }, [load]);

  const onLiveTick = useCallback((payload) => {
    if (!payload?.venues) return;
    setSummary((prev) =>
      prev
        ? {
            ...prev,
            generatedAt: payload.timestamp ?? new Date().toISOString(),
            live: payload,
            venues: prev.venues.map((row) => {
              const liveVenue = payload.venues.find((v) => v.venueId === row.venueId);
              return liveVenue
                ? {
                    ...row,
                    revenueToday: liveVenue.revenueToday,
                    activeOrders: liveVenue.activeOrders,
                    openTablesCount: liveVenue.openTablesCount,
                    ordersPerMinute: liveVenue.ordersPerMinute,
                  }
                : row;
            }),
          }
        : prev,
    );
  }, []);

  useMetricsSocket(token, liveUpdates ? onLiveTick : null);

  const live = summary?.live;
  const totals = useMemo(
    () => ({
      revenueToday: live?.totalRevenueToday ?? summary?.sales?.today?.revenue ?? 0,
      activeOrders: live?.totalActiveOrders ?? 0,
      openTables: live?.totalOpenTables ?? 0,
    }),
    [live, summary?.sales?.today?.revenue],
  );

  return (
    <div className="space-y-8">
      <PageHeader
        title={t('dashboard.executiveTitle')}
        subtitle={t('dashboard.executiveSubtitle')}
        meta={
          summary?.generatedAt
            ? t('metrics.lastUpdated', {
                time: formatShortDate(summary.generatedAt, locale),
              })
            : null
        }
        actions={
          <>
            {canPickVenue && venues.length > 1 ? (
              <select
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                value={venueId}
                onChange={(e) => setVenueId(e.target.value)}
              >
                <option value="">{t('analytics.allVenues')}</option>
                {venues.map((v) => (
                  <option key={v.id} value={v.id}>
                    {i18n.language === 'ar' ? v.nameAr : v.nameEn}
                  </option>
                ))}
              </select>
            ) : null}
            <Link
              to="/analytics"
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              {t('dashboard.viewAnalytics')}
            </Link>
            <button
              type="button"
              onClick={() => load()}
              className="rounded-lg bg-primary-to px-3 py-2 text-sm font-medium text-white hover:opacity-95"
            >
              {t('common.retry')}
            </button>
          </>
        }
      />

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {loading && !summary ? (
        <p className="text-sm text-slate-500">{t('common.loading')}</p>
      ) : summary ? (
        <>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label={t('dashboard.netSalesToday')}
              value={formatMoney(totals.revenueToday, locale, currencyLabel)}
              trend={
                summary.sales?.today?.comparison
                  ? {
                      changePercent: summary.sales.today.comparison.changePercent,
                      changeAmount: summary.sales.today.comparison.changeAmount,
                      locale,
                      currencyLabel,
                    }
                  : null
              }
            />
            <StatCard
              label={t('dashboard.netSalesWeek')}
              value={formatMoney(summary.sales?.week?.revenue ?? 0, locale, currencyLabel)}
              trend={
                summary.sales?.week?.comparison
                  ? {
                      changePercent: summary.sales.week.comparison.changePercent,
                      changeAmount: summary.sales.week.comparison.changeAmount,
                      locale,
                      currencyLabel,
                    }
                  : null
              }
            />
            <StatCard label={t('metrics.openTables')} value={totals.openTables} />
            <StatCard label={t('metrics.activeOrders')} value={totals.activeOrders} />
          </section>

          <div className="grid gap-6 xl:grid-cols-3">
            <section className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm xl:col-span-2">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-slate-900">
                    {t('dashboard.sevenDayTrend')}
                  </h3>
                  <p className="text-sm text-slate-500">{t('dashboard.sevenDayTrendHint')}</p>
                </div>
              </div>
              <MiniBarChart
                data={summary.sales?.dailyTrend}
                locale={locale}
                currencyLabel={currencyLabel}
                emptyLabel={t('analytics.noData')}
              />
            </section>

            <section className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm">
              <h3 className="text-base font-semibold text-slate-900">
                {t('dashboard.recentChanges')}
              </h3>
              <p className="mt-1 text-sm text-slate-500">{t('dashboard.recentChangesHint')}</p>
              <div className="mt-4">
                <RecentActivityFeed
                  events={summary.recentEvents}
                  t={t}
                  locale={locale}
                  currencyLabel={currencyLabel}
                  emptyLabel={t('dashboard.noRecentChanges')}
                />
              </div>
            </section>
          </div>

          <section className="rounded-2xl border border-slate-200/80 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-6 py-4">
              <h3 className="text-base font-semibold text-slate-900">
                {t('dashboard.venuePerformance')}
              </h3>
              <p className="mt-1 text-sm text-slate-500">{t('dashboard.venuePerformanceHint')}</p>
            </div>
            <VenuePerformanceTable
              rows={summary.venues}
              t={t}
              locale={locale}
              currencyLabel={currencyLabel}
              language={i18n.language}
            />
          </section>
        </>
      ) : null}
    </div>
  );
}
