import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { isHubStaff } from '@venue-pos/shared';
import { apiFetch, apiFetchBlob } from '../api/client.js';
import { friendlyError } from '../utils/apiError.js';
import { useAuth } from '../hooks/useAuth.js';
import { PageHeader } from '../components/dashboard/PageHeader.jsx';
import { StatCard } from '../components/dashboard/StatCard.jsx';
import { formatMoney } from '../utils/dashboardFormat.js';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

const PRESETS = ['today', 'yesterday', 'week', 'last_week', 'month', 'last_month', 'custom'];

function labelEntity(row, language) {
  return language === 'ar' ? row.nameAr || row.nameEn : row.nameEn;
}

export function AnalyticsPage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const [preset, setPreset] = useState('week');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [venues, setVenues] = useState([]);
  const [venueId, setVenueId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const locale = i18n.language === 'ar' ? 'ar-EG' : 'en-EG';
  const currencyLabel = t('pos.currency');
  const canPickVenue = isHubStaff(user?.role);

  const query = useMemo(() => {
    if (preset === 'custom' && (!customFrom || !customTo)) return null;
    const params = new URLSearchParams({ preset });
    if (preset === 'custom') {
      params.set('from', customFrom);
      params.set('to', customTo);
    }
    if (venueId) params.set('venueId', venueId);
    if (categoryId) params.set('categoryId', categoryId);
    return params.toString();
  }, [preset, customFrom, customTo, venueId, categoryId]);

  const customRangeReady = preset !== 'custom' || (customFrom && customTo);

  const load = useCallback(async () => {
    if (!query) {
      setReport(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const [data, venueList] = await Promise.all([
        apiFetch(`/api/v1/manager/analytics/revenue?${query}`),
        canPickVenue ? apiFetch('/api/v1/venues') : Promise.resolve([]),
      ]);
      setReport(data);
      if (canPickVenue) setVenues(Array.isArray(venueList) ? venueList : []);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setLoading(false);
    }
  }, [query, canPickVenue]);

  useEffect(() => {
    load();
  }, [load]);

  const chartData = useMemo(() => {
    if (!report) return [];
    if (categoryId && report.items?.length) {
      return report.items.slice(0, 12).map((row) => ({
        id: row.menuItemId,
        name: labelEntity(row, i18n.language),
        revenue: row.revenue,
      }));
    }
    if (report.categories?.length && report.drillVenueId) {
      return report.categories.slice(0, 12).map((row) => ({
        id: row.categoryId,
        name: labelEntity(row, i18n.language),
        revenue: row.revenue,
      }));
    }
    return report.byVenue.map((row) => ({
      id: row.venueId,
      name: labelEntity(row, i18n.language),
      revenue: row.revenue,
    }));
  }, [report, categoryId, i18n.language]);

  const chartTitle = categoryId
    ? t('analytics.item')
    : report?.drillVenueId
      ? t('analytics.itemsChart')
      : t('analytics.revenueChart');

  async function exportCsv() {
    if (!query) return;
    const blob = await apiFetchBlob(`/api/v1/manager/analytics/revenue?${query}&format=csv`);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const suffix = preset === 'custom' ? `${customFrom}-to-${customTo}` : preset;
    a.download = `revenue-${suffix}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title={t('analytics.title')}
        subtitle={t('analytics.subtitle')}
        actions={
          <button
            type="button"
            onClick={() => exportCsv().catch((e) => setError(friendlyError(e)))}
            disabled={!customRangeReady || !report}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t('analytics.exportCsv')}
          </button>
        }
      />

      <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                setPreset(key);
                setCategoryId('');
              }}
              className={`rounded-full px-3 py-1.5 text-sm font-medium ${
                preset === key
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {t(`analytics.preset.${key}`)}
            </button>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-end gap-3">
          {preset === 'custom' ? (
            <>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  {t('analytics.from')}
                </span>
                <input
                  type="date"
                  className="rounded-lg border border-slate-200 px-3 py-2"
                  value={customFrom}
                  max={customTo || undefined}
                  onChange={(e) => setCustomFrom(e.target.value)}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  {t('analytics.to')}
                </span>
                <input
                  type="date"
                  className="rounded-lg border border-slate-200 px-3 py-2"
                  value={customTo}
                  min={customFrom || undefined}
                  onChange={(e) => setCustomTo(e.target.value)}
                />
              </label>
            </>
          ) : null}

          {canPickVenue && venues.length > 1 ? (
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                {t('analytics.filterVenue')}
              </span>
              <select
                className="rounded-lg border border-slate-200 px-3 py-2"
                value={venueId}
                onChange={(e) => {
                  setVenueId(e.target.value);
                  setCategoryId('');
                }}
              >
                <option value="">{t('analytics.allVenues')}</option>
                {venues.map((v) => (
                  <option key={v.id} value={v.id}>
                    {i18n.language === 'ar' ? v.nameAr : v.nameEn}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
      </section>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {loading && !report && customRangeReady ? (
        <p className="text-sm text-slate-500">{t('common.loading')}</p>
      ) : preset === 'custom' && !customRangeReady ? (
        <p className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
          {t('analytics.customHint')}
        </p>
      ) : report ? (
        <>
          <section className="grid gap-4 sm:grid-cols-2">
            <StatCard
              label={t('analytics.totalRevenue')}
              value={formatMoney(report.totalRevenue, locale, currencyLabel)}
            />
            {report.comparison ? (
              <StatCard
                label={t('analytics.vsPrevious')}
                value={formatMoney(report.comparison.previous, locale, currencyLabel)}
                trend={{
                  changePercent: report.comparison.changePercent,
                  changeAmount: report.comparison.changeAmount,
                  locale,
                  currencyLabel,
                }}
              />
            ) : null}
          </section>

          <section className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-slate-900">{chartTitle}</h3>
                {categoryId ? (
                  <button
                    type="button"
                    className="mt-1 text-sm text-primary-from hover:underline"
                    onClick={() => setCategoryId('')}
                  >
                    {t('analytics.backToCategories')}
                  </button>
                ) : null}
              </div>
            </div>

            {chartData.length === 0 ? (
              <p className="text-sm text-slate-500">{t('analytics.noData')}</p>
            ) : (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 12, fill: '#64748b' }}
                      interval={0}
                      angle={-18}
                      textAnchor="end"
                      height={72}
                    />
                    <YAxis tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                    <Tooltip
                      formatter={(value) => formatMoney(value, locale, currencyLabel)}
                      contentStyle={{ borderRadius: 12, borderColor: '#e2e8f0' }}
                    />
                    <Bar
                      dataKey="revenue"
                      fill="#0f172a"
                      radius={[6, 6, 0, 0]}
                      maxBarSize={48}
                      onClick={(data) => {
                        if (!report.drillVenueId || categoryId) return;
                        if (data?.payload?.id) setCategoryId(data.payload.id);
                      }}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </section>

          {!categoryId && report.categories?.length > 0 ? (
            <section className="rounded-2xl border border-slate-200/80 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-6 py-4">
                <h3 className="text-base font-semibold text-slate-900">{t('analytics.category')}</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-start text-xs uppercase tracking-wide text-slate-500">
                      <th className="px-6 py-3 font-semibold">{t('analytics.category')}</th>
                      <th className="px-6 py-3 font-semibold">{t('analytics.revenue')}</th>
                      <th className="px-6 py-3 font-semibold" />
                    </tr>
                  </thead>
                  <tbody>
                    {report.categories.map((row) => (
                      <tr key={row.categoryId} className="border-b border-slate-100 last:border-0">
                        <td className="px-6 py-3 font-medium text-slate-900">
                          {labelEntity(row, i18n.language)}
                        </td>
                        <td className="px-6 py-3 text-slate-700">
                          {formatMoney(row.revenue, locale, currencyLabel)}
                        </td>
                        <td className="px-6 py-3 text-end">
                          <button
                            type="button"
                            className="text-sm font-medium text-primary-from hover:underline"
                            onClick={() => setCategoryId(row.categoryId)}
                          >
                            {t('analytics.drillDown')}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
