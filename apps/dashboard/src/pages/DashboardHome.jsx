import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ROLES, isHubStaff } from '@venue-pos/shared';
import { apiFetch } from '../api/client.js';
import { friendlyError } from '../utils/apiError.js';
import { useAuth } from '../hooks/useAuth.js';
import { useMetricsSocket } from '../hooks/useMetricsSocket.js';
import { StatCard } from '../components/dashboard/StatCard.jsx';
import { MiniBarChart } from '../components/dashboard/MiniBarChart.jsx';
import { VenuePerformanceTable } from '../components/dashboard/VenuePerformanceTable.jsx';
import { RecentActivityFeed } from '../components/dashboard/RecentActivityFeed.jsx';
import {
  StatCardSkeleton,
  ChartSkeleton,
  PanelSkeleton,
} from '../components/dashboard/Skeleton.jsx';
import {
  ActivityIcon,
  AlertIcon,
  AnalyticsIcon,
  ArrowUpRightIcon,
  CheckCircleIcon,
  ChequeIcon,
  MenuIcon,
  OrdersIcon,
  RefreshIcon,
  RevenueIcon,
  CalendarIcon,
  TablesIcon,
  SparkIcon,
} from '../components/dashboard/icons.jsx';
import { formatMoney, formatShortDate, venueLabel } from '../utils/dashboardFormat.js';

function greetingKey() {
  const h = new Date().getHours();
  if (h < 12) return 'dashboard.greetingMorning';
  if (h < 18) return 'dashboard.greetingAfternoon';
  return 'dashboard.greetingEvening';
}

function SectionCard({ title, hint, action, children, className = '' }) {
  return (
    <section className={`surface-card ${className}`}>
      {(title || action) && (
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-6 py-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
            {hint ? <p className="mt-0.5 text-xs text-slate-500">{hint}</p> : null}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

const QUICK_ACTIONS = [
  { to: '/cheques', labelKey: 'nav.cheques', Icon: ChequeIcon, roles: [ROLES.HUB_MANAGER] },
  { to: '/orders', labelKey: 'nav.orders', Icon: OrdersIcon, roles: [ROLES.HUB_MANAGER] },
  { to: '/menus', labelKey: 'nav.menus', Icon: MenuIcon, roles: [ROLES.HUB_MANAGER] },
  { to: '/analytics', labelKey: 'nav.analytics', Icon: AnalyticsIcon, roles: [ROLES.HUB_OWNER] },
  { to: '/activity', labelKey: 'nav.activity', Icon: ActivityIcon, roles: [ROLES.HUB_MANAGER] },
];

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
      revenueWeek: summary?.sales?.week?.revenue ?? 0,
      activeOrders: live?.totalActiveOrders ?? 0,
      openTables: live?.totalOpenTables ?? 0,
    }),
    [live, summary?.sales?.today?.revenue, summary?.sales?.week?.revenue],
  );

  const sparkData = useMemo(
    () => (summary?.sales?.dailyTrend ?? []).map((d) => Number(d.revenue ?? 0)),
    [summary?.sales?.dailyTrend],
  );

  const money = useCallback((v) => formatMoney(v, locale, currencyLabel), [locale, currencyLabel]);
  const int = useCallback((v) => Math.round(v).toLocaleString(locale), [locale]);

  const todayTrend = summary?.sales?.today?.comparison ?? null;
  const weekTrend = summary?.sales?.week?.comparison ?? null;

  const insights = useMemo(() => {
    if (!summary) return [];
    const out = [];
    const topVenue = [...(summary.venues ?? [])]
      .sort((a, b) => Number(b.revenueToday ?? 0) - Number(a.revenueToday ?? 0))[0];
    if (topVenue && Number(topVenue.revenueToday ?? 0) > 0) {
      out.push({
        tone: 'emerald',
        text: t('dashboard.insightTopVenue', {
          venue: venueLabel(topVenue, i18n.language),
          amount: new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(topVenue.revenueToday),
          currency: currencyLabel,
        }),
      });
    }
    if (todayTrend?.changePercent != null) {
      const up = Number(todayTrend.changePercent) >= 0;
      out.push({
        tone: up ? 'emerald' : 'amber',
        text: t(up ? 'dashboard.insightTrendUp' : 'dashboard.insightTrendDown', {
          percent: Math.abs(Number(todayTrend.changePercent)).toFixed(1),
        }),
      });
    }
    if (Number(totals.revenueWeek) > 0) {
      out.push({
        tone: 'blue',
        text: t('dashboard.insightWeek', {
          amount: new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(totals.revenueWeek),
          currency: currencyLabel,
        }),
      });
    }
    return out;
  }, [summary, todayTrend, totals.revenueWeek, t, locale, currencyLabel, i18n.language]);

  const alerts = useMemo(() => {
    if (!summary) return [];
    const out = [];
    const refundCount = (summary.recentEvents ?? []).filter((e) => e.type === 'refund').length;
    if (refundCount > 0) {
      out.push({ tone: 'amber', text: t('dashboard.alertRefunds', { count: refundCount }) });
    }
    if (todayTrend?.changePercent != null && Number(todayTrend.changePercent) < -5) {
      out.push({
        tone: 'red',
        text: t('dashboard.alertSalesDown', {
          percent: Math.abs(Number(todayTrend.changePercent)).toFixed(1),
        }),
      });
    }
    if (Number(totals.revenueToday) <= 0) {
      out.push({ tone: 'slate', text: t('dashboard.alertNoSales') });
    }
    return out;
  }, [summary, todayTrend, totals.revenueToday, t]);

  const quickActions = QUICK_ACTIONS.filter((a) => a.roles.includes(user?.role));
  const greeting = t(greetingKey());
  const showSkeleton = loading && !summary;

  return (
    <div className="space-y-6">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-3xl border border-slate-200/70 bg-white shadow-card">
        <div className="absolute inset-0 bg-hero-glow" aria-hidden="true" />
        <div className="relative flex flex-wrap items-end justify-between gap-5 px-6 py-7 sm:px-8">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
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
            <p className="mt-1.5 max-w-xl text-sm text-slate-500">{t('dashboard.heroSubtitle')}</p>
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
            <Link to="/analytics" className="btn-ghost">
              <AnalyticsIcon className="h-4 w-4" />
              {t('dashboard.viewAnalytics')}
            </Link>
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

      {/* KPIs */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {showSkeleton ? (
          Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={i} />)
        ) : summary ? (
          <>
            <StatCard
              label={t('dashboard.netSalesToday')}
              amount={totals.revenueToday}
              format={money}
              icon={RevenueIcon}
              tone="emerald"
              spark={sparkData}
              trend={
                todayTrend
                  ? {
                      changePercent: todayTrend.changePercent,
                      changeAmount: todayTrend.changeAmount,
                      locale,
                      currencyLabel,
                      showAmount: false,
                    }
                  : null
              }
            />
            <StatCard
              label={t('dashboard.netSalesWeek')}
              amount={totals.revenueWeek}
              format={money}
              icon={CalendarIcon}
              tone="blue"
              spark={sparkData}
              trend={
                weekTrend
                  ? {
                      changePercent: weekTrend.changePercent,
                      changeAmount: weekTrend.changeAmount,
                      locale,
                      currencyLabel,
                      showAmount: false,
                    }
                  : null
              }
            />
            <StatCard
              label={t('metrics.openTables')}
              amount={totals.openTables}
              format={int}
              hint={t('dashboard.openTablesHint')}
              icon={TablesIcon}
              tone="violet"
            />
            <StatCard
              label={t('metrics.activeOrders')}
              amount={totals.activeOrders}
              format={int}
              hint={t('dashboard.activeOrdersHint')}
              icon={OrdersIcon}
              tone="amber"
            />
          </>
        ) : null}
      </section>

      {/* Analytics + Insights */}
      <div className="grid gap-6 xl:grid-cols-3">
        {showSkeleton ? (
          <>
            <ChartSkeleton />
            <PanelSkeleton rows={3} />
          </>
        ) : summary ? (
          <>
            <SectionCard
              className="xl:col-span-2"
              title={t('dashboard.sevenDayTrend')}
              hint={t('dashboard.sevenDayTrendHint')}
            >
              <div className="px-4 py-5 sm:px-6">
                <MiniBarChart
                  data={summary.sales?.dailyTrend}
                  locale={locale}
                  currencyLabel={currencyLabel}
                  emptyLabel={t('analytics.noData')}
                />
              </div>
            </SectionCard>

            <SectionCard title={t('dashboard.insights')} hint={t('dashboard.insightsHint')}>
              <div className="space-y-3 px-6 py-5">
                {insights.length ? (
                  insights.map((item, idx) => (
                    <div
                      key={idx}
                      className="flex gap-3 rounded-xl border border-slate-100 bg-surface-overlay p-3.5"
                    >
                      <span
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ring-1 ${
                          item.tone === 'amber'
                            ? 'bg-amber-50 text-amber-600 ring-amber-100'
                            : item.tone === 'blue'
                              ? 'bg-blue-50 text-blue-600 ring-blue-100'
                              : 'bg-accent-50 text-accent-600 ring-accent-100'
                        }`}
                      >
                        <SparkIcon className="h-4 w-4" />
                      </span>
                      <p className="text-sm leading-relaxed text-slate-700">{item.text}</p>
                    </div>
                  ))
                ) : (
                  <div className="flex flex-col items-center gap-2 py-8 text-center">
                    <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                      <SparkIcon className="h-5 w-5" />
                    </span>
                    <p className="text-sm text-slate-500">{t('dashboard.insightNoData')}</p>
                  </div>
                )}
              </div>
            </SectionCard>
          </>
        ) : null}
      </div>

      {/* Activity + Alerts + Quick actions */}
      {!showSkeleton && summary ? (
        <div className="grid gap-6 xl:grid-cols-3">
          <SectionCard
            className="xl:col-span-2"
            title={t('dashboard.recentChanges')}
            hint={t('dashboard.recentChangesHint')}
            action={
              <Link
                to="/activity"
                className="inline-flex items-center gap-1 text-xs font-semibold text-accent-600 transition hover:text-accent-700"
              >
                {t('dashboard.viewActivity')}
                <ArrowUpRightIcon className="h-3.5 w-3.5" />
              </Link>
            }
          >
            <div className="px-4 py-4 sm:px-5">
              <RecentActivityFeed
                events={summary.recentEvents}
                t={t}
                locale={locale}
                currencyLabel={currencyLabel}
                emptyLabel={t('dashboard.noRecentChanges')}
              />
            </div>
          </SectionCard>

          <div className="space-y-6">
            <SectionCard title={t('dashboard.smartAlerts')} hint={t('dashboard.smartAlertsHint')}>
              <div className="space-y-2.5 px-6 py-5">
                {alerts.length ? (
                  alerts.map((alert, idx) => (
                    <div
                      key={idx}
                      className={`flex items-start gap-3 rounded-xl border p-3.5 ${
                        alert.tone === 'red'
                          ? 'border-red-200 bg-red-50'
                          : alert.tone === 'amber'
                            ? 'border-amber-200 bg-amber-50'
                            : 'border-slate-200 bg-slate-50'
                      }`}
                    >
                      <AlertIcon
                        className={`h-5 w-5 shrink-0 ${
                          alert.tone === 'red'
                            ? 'text-red-500'
                            : alert.tone === 'amber'
                              ? 'text-amber-500'
                              : 'text-slate-400'
                        }`}
                      />
                      <p className="text-sm font-medium text-slate-700">{alert.text}</p>
                    </div>
                  ))
                ) : (
                  <div className="flex flex-col items-center gap-2 py-6 text-center">
                    <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent-50 text-accent-600">
                      <CheckCircleIcon className="h-6 w-6" />
                    </span>
                    <p className="text-sm font-semibold text-slate-700">{t('dashboard.allClear')}</p>
                    <p className="text-xs text-slate-500">{t('dashboard.allClearHint')}</p>
                  </div>
                )}
              </div>
            </SectionCard>

            {quickActions.length ? (
              <SectionCard title={t('dashboard.quickActions')} hint={t('dashboard.quickActionsHint')}>
                <div className="grid grid-cols-2 gap-2.5 p-5">
                  {quickActions.map(({ to, labelKey, Icon }) => (
                    <Link
                      key={to}
                      to={to}
                      className="group flex flex-col gap-2 rounded-xl border border-slate-200 bg-surface-overlay p-3.5 transition duration-200 ease-premium hover:-translate-y-0.5 hover:border-accent-300 hover:shadow-card-hover"
                    >
                      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-50 text-accent-600 ring-1 ring-accent-100 transition group-hover:bg-accent-gradient group-hover:text-white group-hover:ring-transparent">
                        <Icon className="h-5 w-5" />
                      </span>
                      <span className="text-sm font-semibold text-slate-700">{t(labelKey)}</span>
                    </Link>
                  ))}
                </div>
              </SectionCard>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Venue performance */}
      {showSkeleton ? (
        <PanelSkeleton rows={4} />
      ) : summary ? (
        <SectionCard
          title={t('dashboard.venuePerformance')}
          hint={t('dashboard.venuePerformanceHint')}
        >
          <VenuePerformanceTable
            rows={summary.venues}
            t={t}
            locale={locale}
            currencyLabel={currencyLabel}
            language={i18n.language}
          />
        </SectionCard>
      ) : null}
    </div>
  );
}
