import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { isHubStaff } from '@venue-pos/shared';
import { apiFetch } from '../api/client.js';
import { friendlyError } from '../utils/apiError.js';
import { useAuth } from '../hooks/useAuth.js';
import { PageHeader } from '../components/dashboard/PageHeader.jsx';
import { StatCard } from '../components/dashboard/StatCard.jsx';
import { MiniBarChart } from '../components/dashboard/MiniBarChart.jsx';
import { RecentActivityFeed } from '../components/dashboard/RecentActivityFeed.jsx';
import { formatMoney, formatShortDate } from '../utils/dashboardFormat.js';

export function OperationsOverviewPage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const [summary, setSummary] = useState(null);
  const [venueId, setVenueId] = useState('');
  const [venues, setVenues] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const locale = i18n.language === 'ar' ? 'ar-EG' : 'en-EG';
  const currencyLabel = t('pos.currency');
  const canPickVenue = isHubStaff(user?.role);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const q = venueId ? `?venueId=${encodeURIComponent(venueId)}` : '';
      const [data, venueList] = await Promise.all([
        apiFetch(`/api/v1/manager/dashboard/operations${q}`),
        canPickVenue ? apiFetch('/api/v1/venues') : Promise.resolve([]),
      ]);
      setSummary(data);
      if (canPickVenue) setVenues(Array.isArray(venueList) ? venueList : []);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setLoading(false);
    }
  }, [venueId, canPickVenue]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-8">
      <PageHeader
        title={t('dashboard.operationsTitle')}
        subtitle={t('dashboard.operationsSubtitle')}
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
              to="/activity"
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              {t('dashboard.viewActivity')}
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
              value={formatMoney(summary.today?.netRevenue ?? 0, locale, currencyLabel)}
              trend={
                summary.today?.comparison
                  ? {
                      changePercent: summary.today.comparison.changePercent,
                      changeAmount: summary.today.comparison.changeAmount,
                      locale,
                      currencyLabel,
                    }
                  : null
              }
            />
            <StatCard
              label={t('dashboard.refundsToday')}
              value={formatMoney(summary.today?.totalRefunds ?? 0, locale, currencyLabel)}
              hint={t('dashboard.refundsTodayHint', { count: summary.today?.refundCount ?? 0 })}
            />
            <StatCard
              label={t('dashboard.openOperations')}
              value={summary.operations?.openCheques ?? 0}
              hint={t('dashboard.openOperationsHint', {
                shifts: summary.operations?.openShifts ?? 0,
              })}
            />
            <StatCard
              label={t('dashboard.terminalsOnline')}
              value={`${summary.operations?.terminalsOnline ?? 0}/${summary.operations?.terminalsTotal ?? 0}`}
              hint={t('dashboard.terminalsOnlineHint', {
                offline: summary.operations?.terminalsOffline ?? 0,
              })}
            />
          </section>

          <div className="grid gap-6 xl:grid-cols-3">
            <section className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm xl:col-span-2">
              <h3 className="text-base font-semibold text-slate-900">{t('dashboard.sevenDayTrend')}</h3>
              <p className="mt-1 text-sm text-slate-500">{t('dashboard.sevenDayTrendHint')}</p>
              <div className="mt-4">
                <MiniBarChart
                  data={summary.dailyTrend}
                  locale={locale}
                  currencyLabel={currencyLabel}
                  emptyLabel={t('analytics.noData')}
                />
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm">
              <h3 className="text-base font-semibold text-slate-900">{t('dashboard.todayBreakdown')}</h3>
              <dl className="mt-4 space-y-3 text-sm">
                <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3">
                  <dt className="text-slate-500">{t('dashboard.grossSales')}</dt>
                  <dd className="font-medium text-slate-900">
                    {formatMoney(summary.today?.grossRevenue ?? 0, locale, currencyLabel)}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3">
                  <dt className="text-slate-500">{t('dashboard.discountsToday')}</dt>
                  <dd className="font-medium text-slate-900">
                    {formatMoney(summary.today?.discountTotal ?? 0, locale, currencyLabel)}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3">
                  <dt className="text-slate-500">{t('dashboard.paymentsToday')}</dt>
                  <dd className="font-medium text-slate-900">{summary.today?.paymentCount ?? 0}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-slate-500">{t('dashboard.cashToday')}</dt>
                  <dd className="font-medium text-slate-900">
                    {formatMoney(summary.today?.paymentsByMethod?.cash ?? 0, locale, currencyLabel)}
                  </dd>
                </div>
              </dl>
            </section>
          </div>

          <section className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm">
            <h3 className="text-base font-semibold text-slate-900">{t('dashboard.recentChanges')}</h3>
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
        </>
      ) : null}
    </div>
  );
}
