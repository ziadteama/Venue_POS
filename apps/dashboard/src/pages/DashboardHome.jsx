import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { isHubStaff, canSeeFinancials } from '@venue-pos/shared';
import { apiFetch } from '../api/client.js';
import { friendlyError } from '../utils/apiError.js';
import { useAuth } from '../hooks/useAuth.js';
import { useMetricsSocket } from '../hooks/useMetricsSocket.js';
import { StatCard } from '../components/dashboard/StatCard.jsx';
import { MiniBarChart } from '../components/dashboard/MiniBarChart.jsx';
import { RecentActivityFeed } from '../components/dashboard/RecentActivityFeed.jsx';
import { StatCardSkeleton, ChartSkeleton, PanelSkeleton } from '../components/dashboard/Skeleton.jsx';
import { SectionCard } from '../components/ui/Card.jsx';
import { SegmentedControl } from '../components/ui/SegmentedControl.jsx';
import { AttentionCenter } from '../components/dashboard/executive/AttentionCenter.jsx';
import { VenueRankingPanel } from '../components/dashboard/executive/VenueRankingPanel.jsx';
import { FinancialHealthPanel } from '../components/dashboard/executive/FinancialHealthPanel.jsx';
import { OperationsSnapshot } from '../components/dashboard/executive/OperationsSnapshot.jsx';
import { ExecutiveQuickNav } from '../components/dashboard/executive/ExecutiveQuickNav.jsx';
import { VenueComparisonBars } from '../components/dashboard/executive/VenueComparisonBars.jsx';
import {
  AlertIcon,
  RefreshIcon,
  RevenueIcon,
  RefundIcon,
  StoreIcon,
  AnalyticsIcon,
  OrdersIcon,
} from '../components/dashboard/icons.jsx';
import { formatMoney, formatShortDate } from '../utils/dashboardFormat.js';

function greetingKey() {
  const h = new Date().getHours();
  if (h < 12) return 'dashboard.greetingMorning';
  if (h < 18) return 'dashboard.greetingAfternoon';
  return 'dashboard.greetingEvening';
}

export function DashboardHome() {
  const { t, i18n } = useTranslation();
  const { user, token } = useAuth();
  const [summary, setSummary] = useState(null);
  const [venueId, setVenueId] = useState('');
  const [venues, setVenues] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [liveUpdates, setLiveUpdates] = useState(false);
  const [chartMode, setChartMode] = useState('daily');

  const locale = i18n.language === 'ar' ? 'ar-EG' : 'en-EG';
  const currencyLabel = t('pos.currency');
  const canPickVenue = isHubStaff(user?.role);
  const hideFinancials = !canSeeFinancials(user);

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
    setSummary((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        generatedAt: payload.timestamp ?? new Date().toISOString(),
        live: payload,
        operations: {
          ...prev.operations,
          activeOrders: payload.totalActiveOrders ?? prev.operations?.activeOrders,
          openTables: payload.totalOpenTables ?? prev.operations?.openTables,
        },
        ranking: prev.ranking
          ? {
              ...prev.ranking,
              venues: prev.ranking.venues.map((row) => {
                const liveVenue = payload.venues.find((v) => v.venueId === row.venueId);
                return liveVenue
                  ? {
                      ...row,
                      activeOrders: liveVenue.activeOrders,
                      openTablesCount: liveVenue.openTablesCount,
                    }
                  : row;
              }),
            }
          : prev.ranking,
      };
    });
  }, []);

  useMetricsSocket(token, liveUpdates ? onLiveTick : null);

  const sparkData = useMemo(
    () => (summary?.dailyTrend ?? []).map((d) => Number(d.revenue ?? 0)),
    [summary?.dailyTrend],
  );

  const chartData = useMemo(() => {
    if (chartMode === 'weekly') {
      return (summary?.weeklyTrend ?? []).map((d) => ({
        weekday: d.label,
        revenue: d.revenue,
        date: d.weekStart,
      }));
    }
    return summary?.dailyTrend ?? [];
  }, [chartMode, summary?.dailyTrend, summary?.weeklyTrend]);

  const showSkeleton = loading && !summary;
  const greeting = t(greetingKey());
  const exec = summary?.summary;
  const trendProps = { locale, currencyLabel, showAmount: false };

  return (
    <div className="space-y-8">
      <section className="relative overflow-hidden rounded-3xl border border-slate-200/70 bg-white shadow-card">
        <div className="absolute inset-0 bg-hero-glow" aria-hidden="true" />
        <div className="relative flex flex-wrap items-end justify-between gap-5 px-6 py-7 sm:px-8">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-50 px-2.5 py-1 text-xs font-semibold text-accent-700 ring-1 ring-inset ring-accent-200">
                <span className={`h-1.5 w-1.5 rounded-full bg-accent-500 ${liveUpdates ? 'animate-pulse' : ''}`} />
                {t('dashboard.live')}
              </span>
              {summary?.generatedAt ? (
                <span className="text-xs font-medium text-slate-400">
                  {t('metrics.lastUpdated', { time: formatShortDate(summary.generatedAt, locale) })}
                </span>
              ) : null}
            </div>
            <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              {greeting}, {user?.username}
            </h1>
            <p className="mt-1.5 max-w-2xl text-sm text-slate-500">{t('dashboard.executiveSubtitle')}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {canPickVenue && venues.length > 1 ? (
              <select
                className="premium-input w-auto py-2"
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
            <button type="button" onClick={() => load()} className="btn-accent">
              <RefreshIcon className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              {t('dashboard.refresh')}
            </button>
          </div>
        </div>
      </section>

      {error ? (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          <AlertIcon className="h-5 w-5 shrink-0" />
          {error}
        </div>
      ) : null}

      {showSkeleton ? (
        <PanelSkeleton rows={2} />
      ) : summary ? (
        <AttentionCenter id="attention" items={summary.attention} t={t} />
      ) : null}

      {hideFinancials && !showSkeleton && summary?.summary ? (
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <StatCard
            label={t('dashboard.totalTransactions')}
            value={summary.summary.totalTransactions ?? 0}
            hint={t('dashboard.totalTransactionsHint')}
            icon={OrdersIcon}
            tone="amber"
          />
          <StatCard
            label={t('dashboard.activeVenues')}
            value={summary.summary.activeVenues ?? 0}
            hint={t('dashboard.activeVenuesHint')}
            icon={StoreIcon}
            tone="blue"
          />
        </section>
      ) : null}

      {!hideFinancials ? (
        <section id="summary" className="scroll-mt-24 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {showSkeleton ? (
            Array.from({ length: 8 }).map((_, i) => <StatCardSkeleton key={i} />)
          ) : summary && exec ? (
            <>
              <StatCard
                label={t('dashboard.netSalesToday')}
                value={formatMoney(exec.netSalesToday, locale, currencyLabel)}
                icon={RevenueIcon}
                tone="emerald"
                spark={sparkData}
                trend={
                  exec.netSalesTodayComparison
                    ? { ...exec.netSalesTodayComparison, ...trendProps }
                    : null
                }
              />
              <StatCard
                label={t('dashboard.netSalesWeek')}
                value={formatMoney(exec.netSalesWeek, locale, currencyLabel)}
                icon={AnalyticsIcon}
                tone="blue"
                trend={
                  exec.netSalesWeekComparison
                    ? { ...exec.netSalesWeekComparison, ...trendProps }
                    : null
                }
              />
              <StatCard
                label={t('dashboard.netSalesMonth')}
                value={formatMoney(exec.netSalesMonth, locale, currencyLabel)}
                icon={RevenueIcon}
                tone="violet"
                trend={
                  exec.netSalesMonthComparison
                    ? { ...exec.netSalesMonthComparison, ...trendProps }
                    : null
                }
              />
              <StatCard
                label={t('dashboard.totalTransactions')}
                value={exec.totalTransactions ?? 0}
                hint={t('dashboard.totalTransactionsHint')}
                icon={OrdersIcon}
                tone="amber"
                trend={
                  exec.totalTransactionsComparison
                    ? { ...exec.totalTransactionsComparison, ...trendProps, positiveIsGood: true }
                    : null
                }
              />
              <StatCard
                label={t('dashboard.avgTransaction')}
                value={formatMoney(exec.avgTransactionValue, locale, currencyLabel)}
                hint={t('dashboard.avgTransactionHint')}
                icon={RevenueIcon}
                tone="emerald"
              />
              <StatCard
                label={t('dashboard.refundsToday')}
                value={formatMoney(exec.refundAmountToday, locale, currencyLabel)}
                hint={t('dashboard.refundsTodayHint', { count: exec.refundCountToday ?? 0 })}
                icon={RefundIcon}
                tone="amber"
                trend={
                  exec.refundAmountTodayComparison
                    ? {
                        ...exec.refundAmountTodayComparison,
                        ...trendProps,
                        positiveIsGood: false,
                      }
                    : null
                }
              />
              <StatCard
                label={t('dashboard.activeVenues')}
                value={exec.activeVenues ?? 0}
                hint={t('dashboard.activeVenuesHint')}
                icon={StoreIcon}
                tone="blue"
              />
              <StatCard
                label={t('dashboard.revenueGrowth')}
                value={`${exec.revenueGrowthPercent > 0 ? '+' : ''}${Number(exec.revenueGrowthPercent ?? 0).toFixed(1)}%`}
                hint={t('dashboard.revenueGrowthHint')}
                icon={AnalyticsIcon}
                tone={exec.revenueGrowthPercent >= 0 ? 'emerald' : 'amber'}
              />
            </>
          ) : null}
        </section>
      ) : null}

      {!hideFinancials ? (
        <div id="revenue" className="scroll-mt-24 grid gap-6 xl:grid-cols-3">
          {showSkeleton ? (
            <>
              <div className="xl:col-span-2">
                <ChartSkeleton />
              </div>
              <PanelSkeleton rows={4} />
            </>
          ) : summary ? (
            <>
              <SectionCard
                className="xl:col-span-2"
                title={t('dashboard.revenuePerformanceTitle')}
                hint={t('dashboard.revenuePerformanceHint')}
                action={
                  <SegmentedControl
                    value={chartMode}
                    onChange={setChartMode}
                    options={[
                      { value: 'daily', label: t('dashboard.chartDaily') },
                      { value: 'weekly', label: t('dashboard.chartWeekly') },
                    ]}
                  />
                }
              >
                <MiniBarChart
                  data={chartData}
                  locale={locale}
                  currencyLabel={currencyLabel}
                  emptyLabel={t('analytics.noData')}
                  labelKey={chartMode === 'weekly' ? 'weekday' : 'weekday'}
                />
              </SectionCard>

              <SectionCard
                title={t('dashboard.venueComparisonTitle')}
                hint={t('dashboard.venueComparisonHint')}
              >
                <VenueComparisonBars
                  rows={summary.ranking?.venues}
                  t={t}
                  locale={locale}
                  currencyLabel={currencyLabel}
                  language={i18n.language}
                  hideFinancials={hideFinancials}
                />
              </SectionCard>
            </>
          ) : null}
        </div>
      ) : null}

      {showSkeleton ? (
        <PanelSkeleton rows={5} />
      ) : summary ? (
        <VenueRankingPanel
          id="venues"
          ranking={summary.ranking}
          t={t}
          locale={locale}
          currencyLabel={currencyLabel}
          language={i18n.language}
          hideFinancials={hideFinancials}
          venueId={venueId}
          onSelectVenue={setVenueId}
        />
      ) : null}

      {showSkeleton ? (
        <div className="grid gap-6 xl:grid-cols-3">
          <PanelSkeleton rows={6} className="xl:col-span-2" />
          <PanelSkeleton rows={6} />
        </div>
      ) : summary ? (
        <div className="grid gap-6 xl:grid-cols-3">
          <SectionCard
            id="activity"
            className="scroll-mt-24 xl:col-span-2"
            title={t('dashboard.recentChanges')}
            hint={t('dashboard.recentChangesHint')}
            flush
            bodyClassName="px-4 py-4 sm:px-5"
          >
            <RecentActivityFeed
              events={summary.recentEvents}
              t={t}
              locale={locale}
              currencyLabel={currencyLabel}
              emptyLabel={t('dashboard.noRecentChanges')}
              hideAmounts={hideFinancials}
            />
          </SectionCard>

          <FinancialHealthPanel
            id="financial"
            financial={{ ...summary.financial, refundTrend: summary.financial?.refundTrend }}
            t={t}
            locale={locale}
            currencyLabel={currencyLabel}
            hideFinancials={hideFinancials}
          />
        </div>
      ) : null}

      {showSkeleton ? (
        <PanelSkeleton rows={2} />
      ) : summary ? (
        <OperationsSnapshot id="operations" operations={summary.operations} t={t} />
      ) : null}

      {!showSkeleton && summary ? (
        <ExecutiveQuickNav t={t} canSeeFinancials={!hideFinancials} venueId={venueId} />
      ) : null}
    </div>
  );
}
