import { useCallback, useEffect, useMemo, useState } from 'react';
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
import {
  StatCardSkeleton,
  ChartSkeleton,
  PanelSkeleton,
} from '../components/dashboard/Skeleton.jsx';
import { SectionCard } from '../components/ui/Card.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Select } from '../components/ui/Field.jsx';
import { EmptyState } from '../components/ui/EmptyState.jsx';
import {
  RevenueIcon,
  RefundIcon,
  ChequeIcon,
  HealthIcon,
  AlertIcon,
  CheckCircleIcon,
  ActivityIcon,
  ArrowUpRightIcon,
  RefreshIcon,
  ShiftIcon,
  OrdersIcon,
  MenuIcon,
  PowerIcon,
} from '../components/dashboard/icons.jsx';
import { formatMoney, formatShortDate } from '../utils/dashboardFormat.js';

const QUICK_ACTIONS = [
  { to: '/shifts', labelKey: 'nav.shifts', Icon: ShiftIcon },
  { to: '/cheques', labelKey: 'nav.cheques', Icon: ChequeIcon },
  { to: '/orders', labelKey: 'nav.orders', Icon: OrdersIcon },
  { to: '/menus', labelKey: 'nav.menus', Icon: MenuIcon },
  { to: '/health', labelKey: 'nav.health', Icon: HealthIcon },
];

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

  const sparkData = useMemo(
    () => (summary?.dailyTrend ?? []).map((d) => Number(d.revenue ?? d.netRevenue ?? 0)),
    [summary?.dailyTrend],
  );

  const todayTrend = summary?.today?.comparison ?? null;

  const alerts = useMemo(() => {
    if (!summary) return [];
    const out = [];
    const offline = summary.operations?.terminalsOffline ?? 0;
    if (offline > 0) {
      out.push({ tone: 'red', text: t('dashboard.alertOfflineTerminals', { count: offline }) });
    }
    const refundCount = summary.today?.refundCount ?? 0;
    if (refundCount > 0) {
      out.push({ tone: 'amber', text: t('dashboard.alertRefunds', { count: refundCount }) });
    }
    const openShifts = summary.operations?.openShifts ?? 0;
    if (openShifts > 0) {
      out.push({ tone: 'slate', text: t('dashboard.alertOpenShifts', { count: openShifts }) });
    }
    return out;
  }, [summary, t]);

  const showSkeleton = loading && !summary;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('dashboard.operationsTitle')}
        subtitle={t('dashboard.operationsSubtitle')}
        meta={
          summary?.generatedAt
            ? t('metrics.lastUpdated', { time: formatShortDate(summary.generatedAt, locale) })
            : null
        }
        actions={
          <>
            {canPickVenue && venues.length > 1 ? (
              <Select
                className="w-auto py-2"
                value={venueId}
                onChange={(e) => setVenueId(e.target.value)}
              >
                <option value="">{t('analytics.allVenues')}</option>
                {venues.map((v) => (
                  <option key={v.id} value={v.id}>
                    {i18n.language === 'ar' ? v.nameAr : v.nameEn}
                  </option>
                ))}
              </Select>
            ) : null}
            <Button as={Link} to="/activity" variant="secondary">
              <ActivityIcon className="h-4 w-4" />
              {t('dashboard.viewActivity')}
            </Button>
            <Button variant="primary" onClick={() => load()}>
              <RefreshIcon className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              {t('dashboard.refresh')}
            </Button>
          </>
        }
      />

      {error ? (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          <AlertIcon className="h-5 w-5 shrink-0" />
          {error}
        </div>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {showSkeleton ? (
          Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={i} />)
        ) : summary ? (
          <>
            <StatCard
              label={t('dashboard.netSalesToday')}
              value={formatMoney(summary.today?.netRevenue ?? 0, locale, currencyLabel)}
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
              label={t('dashboard.refundsToday')}
              value={formatMoney(summary.today?.totalRefunds ?? 0, locale, currencyLabel)}
              hint={t('dashboard.refundsTodayHint', { count: summary.today?.refundCount ?? 0 })}
              icon={RefundIcon}
              tone="amber"
            />
            <StatCard
              label={t('dashboard.openOperations')}
              value={summary.operations?.openCheques ?? 0}
              hint={t('dashboard.openOperationsHint', { shifts: summary.operations?.openShifts ?? 0 })}
              icon={ChequeIcon}
              tone="blue"
            />
            <StatCard
              label={t('dashboard.terminalsOnline')}
              value={`${summary.operations?.terminalsOnline ?? 0}/${summary.operations?.terminalsTotal ?? 0}`}
              hint={t('dashboard.terminalsOnlineHint', {
                offline: summary.operations?.terminalsOffline ?? 0,
              })}
              icon={PowerIcon}
              tone="violet"
            />
          </>
        ) : null}
      </section>

      <div className="grid gap-6 xl:grid-cols-3">
        {showSkeleton ? (
          <>
            <ChartSkeleton />
            <PanelSkeleton rows={4} />
          </>
        ) : summary ? (
          <>
            <SectionCard
              className="xl:col-span-2"
              title={t('dashboard.sevenDayTrend')}
              hint={t('dashboard.sevenDayTrendHint')}
            >
              <MiniBarChart
                data={summary.dailyTrend}
                locale={locale}
                currencyLabel={currencyLabel}
                emptyLabel={t('analytics.noData')}
              />
            </SectionCard>

            <SectionCard title={t('dashboard.todayBreakdown')}>
              <dl className="space-y-3 text-sm">
                <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3">
                  <dt className="text-slate-500">{t('dashboard.grossSales')}</dt>
                  <dd className="font-semibold tabular-nums text-slate-900">
                    {formatMoney(summary.today?.grossRevenue ?? 0, locale, currencyLabel)}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3">
                  <dt className="text-slate-500">{t('dashboard.discountsToday')}</dt>
                  <dd className="font-semibold tabular-nums text-slate-900">
                    {formatMoney(summary.today?.discountTotal ?? 0, locale, currencyLabel)}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3">
                  <dt className="text-slate-500">{t('dashboard.paymentsToday')}</dt>
                  <dd className="font-semibold tabular-nums text-slate-900">
                    {summary.today?.paymentCount ?? 0}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-slate-500">{t('dashboard.cashToday')}</dt>
                  <dd className="font-semibold tabular-nums text-slate-900">
                    {formatMoney(summary.today?.paymentsByMethod?.cash ?? 0, locale, currencyLabel)}
                  </dd>
                </div>
              </dl>
            </SectionCard>
          </>
        ) : null}
      </div>

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
            <RecentActivityFeed
              events={summary.recentEvents}
              t={t}
              locale={locale}
              currencyLabel={currencyLabel}
              emptyLabel={t('dashboard.noRecentChanges')}
            />
          </SectionCard>

          <div className="space-y-6">
            <SectionCard title={t('dashboard.smartAlerts')} hint={t('dashboard.smartAlertsHint')}>
              <div className="space-y-2.5">
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
                  <EmptyState
                    icon={CheckCircleIcon}
                    title={t('dashboard.allClear')}
                    hint={t('dashboard.allClearHint')}
                    className="py-6"
                  />
                )}
              </div>
            </SectionCard>

            <SectionCard title={t('dashboard.quickActions')} hint={t('dashboard.quickActionsHint')}>
              <div className="grid grid-cols-2 gap-2.5">
                {QUICK_ACTIONS.map(({ to, labelKey, Icon }) => (
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
          </div>
        </div>
      ) : null}
    </div>
  );
}
