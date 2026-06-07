import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiFetch } from '../api/client.js';
import { useAuth } from '../hooks/useAuth.js';
import { useMetricsSocket } from '../hooks/useMetricsSocket.js';

function formatMoney(value, locale) {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Number(value ?? 0));
}

function tableHeatClass(minutes) {
  if (minutes >= 90) return 'border-red-300 bg-red-50 text-red-900';
  if (minutes >= 45) return 'border-amber-300 bg-amber-50 text-amber-900';
  return 'border-emerald-300 bg-emerald-50 text-emerald-900';
}

function KpiCard({ label, value, hint }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-secondary">{label}</p>
      <p className="mt-2 text-3xl font-bold text-slate-900">{value}</p>
      {hint ? <p className="mt-1 text-xs text-secondary">{hint}</p> : null}
    </div>
  );
}

function OpenTablesGrid({ tables, t, locale, currencyLabel }) {
  if (!tables.length) {
    return (
      <p className="rounded-lg border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-secondary">
        {t('metrics.noOpenTables')}
      </p>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
      {tables.map((table) => (
        <div
          key={table.chequeId}
          className={`rounded-lg border px-3 py-3 ${tableHeatClass(table.minutesOpen)}`}
        >
          <p className="text-sm font-semibold">{table.tableLabel}</p>
          <p className="mt-1 text-xs opacity-80">
            {t('metrics.tableCheque', { number: table.chequeNumber })}
          </p>
          <p className="mt-2 text-sm font-medium">
            {formatMoney(table.runningTotal, locale)} {currencyLabel}
          </p>
          <p className="mt-1 text-xs opacity-80">
            {t('metrics.tableAge', { minutes: table.minutesOpen })}
          </p>
        </div>
      ))}
    </div>
  );
}

export function DashboardHome() {
  const { t, i18n } = useTranslation();
  const { user, token } = useAuth();
  const [metrics, setMetrics] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [liveUpdates, setLiveUpdates] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);

  const applyMetrics = useCallback((payload) => {
    if (!payload?.venues) return;
    setMetrics(payload);
    setLastUpdated(payload.timestamp ?? new Date().toISOString());
    setError('');
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    setLiveUpdates(false);
    try {
      const data = await apiFetch('/api/v1/manager/metrics/live');
      applyMetrics(data);
      setLiveUpdates(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [applyMetrics]);

  useEffect(() => {
    load();
  }, [load]);

  useMetricsSocket(token, liveUpdates ? applyMetrics : null);

  const locale = i18n.language === 'ar' ? 'ar-EG' : 'en-EG';
  const currencyLabel = t('pos.currency');
  const isHub = user?.role === 'hub_manager';

  const totals = useMemo(() => {
    const venues = metrics?.venues ?? [];
    return {
      revenueToday: venues.reduce((sum, venue) => sum + Number(venue.revenueToday ?? 0), 0),
      activeOrders: venues.reduce((sum, venue) => sum + Number(venue.activeOrders ?? 0), 0),
      openTables: venues.reduce((sum, venue) => sum + Number(venue.openTablesCount ?? 0), 0),
      ordersPerMinute: Number(
        venues.reduce((sum, venue) => sum + Number(venue.ordersPerMinute ?? 0), 0).toFixed(2),
      ),
      venueCount: venues.length,
    };
  }, [metrics?.venues]);

  const venues = metrics?.venues ?? [];
  const showVenuePicker = isHub && totals.venueCount > 1;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">{t('metrics.title')}</h2>
          <p className="text-sm text-secondary">{t('metrics.subtitle')}</p>
          {lastUpdated ? (
            <p className="mt-1 text-xs text-secondary">
              {t('metrics.lastUpdated', {
                time: new Intl.DateTimeFormat(locale, {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                }).format(new Date(lastUpdated)),
              })}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => load()}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50"
        >
          {t('common.retry')}
        </button>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700">{error}</div>
      ) : null}

      {loading ? (
        <p className="text-secondary">{t('common.loading')}</p>
      ) : metrics ? (
        <>
          {isHub && totals.venueCount > 1 ? (
            <p className="text-sm text-secondary">{t('metrics.hubScope', { count: totals.venueCount })}</p>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              label={t('metrics.revenueToday')}
              value={`${formatMoney(totals.revenueToday, locale)} ${currencyLabel}`}
            />
            <KpiCard
              label={t('metrics.activeOrders')}
              value={totals.activeOrders}
            />
            <KpiCard
              label={t('metrics.ordersPerMinute')}
              value={totals.ordersPerMinute}
              hint={t('metrics.ordersPerMinuteHint')}
            />
            <KpiCard
              label={t('metrics.openTables')}
              value={totals.openTables}
            />
          </div>

          {venues.map((venue) => {
            const venueName = i18n.language === 'ar' ? venue.nameAr : venue.nameEn;
            return (
              <section
                key={venue.venueId}
                className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
              >
                <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900">{venueName}</h3>
                    {showVenuePicker ? (
                      <p className="text-sm text-secondary">
                        {t('metrics.venueSummary', {
                          revenue: formatMoney(venue.revenueToday, locale),
                          orders: venue.activeOrders,
                          tables: venue.openTablesCount,
                        })}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-4 text-sm text-secondary">
                    <span>
                      {t('metrics.revenueToday')}: {formatMoney(venue.revenueToday, locale)}{' '}
                      {currencyLabel}
                    </span>
                    <span>
                      {t('metrics.activeOrders')}: {venue.activeOrders}
                    </span>
                    <span>
                      {t('metrics.ordersPerMinute')}: {venue.ordersPerMinute}
                    </span>
                  </div>
                </div>

                <h4 className="mb-3 text-sm font-medium text-slate-700">{t('metrics.openTablesHeat')}</h4>
                <OpenTablesGrid
                  tables={venue.openTables}
                  t={t}
                  locale={locale}
                  currencyLabel={currencyLabel}
                />
              </section>
            );
          })}
        </>
      ) : null}
    </div>
  );
}
