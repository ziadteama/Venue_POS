import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { isHubStaff } from '@venue-pos/shared';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { apiFetch, getToken } from '../api/client.js';
import { useAuth } from '../hooks/useAuth.js';

const PRESETS = ['today', 'yesterday', 'week', 'last_week', 'month', 'last_month', 'custom'];

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

function formatMoney(value, locale) {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Number(value ?? 0));
}

function labelEntity(row, language) {
  return language === 'ar' ? row.nameAr || row.nameEn : row.nameEn;
}

export function AnalyticsPage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const [preset, setPreset] = useState('today');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [venues, setVenues] = useState([]);
  const [venueId, setVenueId] = useState(user?.venueId ?? '');
  const [categoryId, setCategoryId] = useState('');
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const locale = i18n.language === 'ar' ? 'ar-EG' : 'en-EG';
  const canPickVenue = isHubStaff(user?.role);

  const query = useMemo(() => {
    if (preset === 'custom' && (!customFrom || !customTo)) return null;

    const params = new URLSearchParams({ preset });
    if (preset === 'custom') {
      params.set('from', customFrom);
      params.set('to', customTo);
    }
    const scopedVenue = canPickVenue ? venueId : user?.venueId;
    if (scopedVenue) params.set('venueId', scopedVenue);
    if (categoryId) params.set('categoryId', categoryId);
    return params.toString();
  }, [preset, customFrom, customTo, venueId, categoryId, canPickVenue, user?.venueId]);

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
      if (canPickVenue) setVenues(venueList);
    } catch (err) {
      setError(err.message);
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
      return report.items.map((row) => ({
        id: row.menuItemId,
        name: labelEntity(row, i18n.language),
        revenue: row.revenue,
      }));
    }
    if (report.categories?.length && report.drillVenueId) {
      return report.categories.map((row) => ({
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
    const token = getToken();
    const res = await fetch(
      `${API_URL}/api/v1/manager/analytics/revenue?${query}&format=csv`,
      { headers: token ? { authorization: `Bearer ${token}` } : {} },
    );
    if (!res.ok) throw new Error(t('analytics.exportFailed'));
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const suffix =
      preset === 'custom' ? `${customFrom}-to-${customTo}` : preset;
    a.download = `revenue-${suffix}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function formatRangeLabel(from, to) {
    if (!from || !to) return null;
    const fmt = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' });
    return t('analytics.rangeLabel', {
      from: fmt.format(new Date(from)),
      to: fmt.format(new Date(to)),
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">{t('analytics.title')}</h2>
          <p className="text-sm text-secondary">{t('analytics.subtitle')}</p>
        </div>
        <button
          type="button"
          onClick={() => exportCsv().catch((e) => setError(e.message))}
          disabled={!customRangeReady}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {t('analytics.exportCsv')}
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {PRESETS.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => {
              setPreset(key);
              setCategoryId('');
            }}
            className={`rounded-full px-3 py-1.5 text-sm ${
              preset === key
                ? 'bg-primary-to text-white'
                : 'border border-slate-300 text-secondary hover:bg-slate-50'
            }`}
          >
            {t(`analytics.preset.${key}`)}
          </button>
        ))}
      </div>

      {preset === 'custom' ? (
        <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs font-medium uppercase tracking-wide text-secondary">
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
            <span className="text-xs font-medium uppercase tracking-wide text-secondary">
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
          {!customRangeReady ? (
            <p className="pb-2 text-sm text-secondary">{t('analytics.customHint')}</p>
          ) : null}
        </div>
      ) : null}

      {canPickVenue && venues.length > 1 && (
        <label className="block text-sm">
          <span className="mb-1 block text-secondary">{t('analytics.filterVenue')}</span>
          <select
            className="rounded border px-3 py-2"
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
      )}

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700">{error}</div>
      ) : null}

      {loading && !report && customRangeReady ? (
        <p className="text-secondary">{t('common.loading')}</p>
      ) : preset === 'custom' && !customRangeReady ? (
        <p className="rounded-xl border border-slate-200 bg-white p-8 text-center text-secondary">
          {t('analytics.customHint')}
        </p>
      ) : report ? (
        <>
          {report.range?.from && report.range?.to ? (
            <p className="text-sm text-secondary">
              {formatRangeLabel(report.range.from, report.range.to)}
            </p>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm text-secondary">{t('analytics.totalRevenue')}</p>
              <p className="mt-2 text-3xl font-bold text-slate-900">
                {formatMoney(report.totalRevenue, locale)} {t('pos.currency')}
              </p>
            </div>
            {report.comparison ? (
              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-sm text-secondary">{t('analytics.vsPrevious')}</p>
                <p className="mt-2 text-2xl font-bold text-slate-900">
                  {formatMoney(report.comparison.previous, locale)} {t('pos.currency')}
                </p>
                <p
                  className={`mt-1 text-sm ${
                    report.comparison.changeAmount >= 0 ? 'text-emerald-700' : 'text-red-700'
                  }`}
                >
                  {t('analytics.change', {
                    amount: formatMoney(report.comparison.changeAmount, locale),
                    percent: report.comparison.changePercent,
                  })}
                </p>
              </div>
            ) : null}
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="mb-4 text-lg font-semibold">{chartTitle}</h3>
            {chartData.length === 0 ? (
              <p className="text-sm text-secondary">{t('analytics.noData')}</p>
            ) : (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} interval={0} angle={-20} textAnchor="end" height={70} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip
                      formatter={(value) =>
                        `${formatMoney(value, locale)} ${t('pos.currency')}`
                      }
                    />
                    <Bar
                      dataKey="revenue"
                      fill="#2563eb"
                      radius={[4, 4, 0, 0]}
                      onClick={(data) => {
                        if (!report.drillVenueId || categoryId) return;
                        if (data?.payload?.id) setCategoryId(data.payload.id);
                      }}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
            {categoryId ? (
              <button
                type="button"
                className="mt-3 text-sm text-primary-from hover:underline"
                onClick={() => setCategoryId('')}
              >
                {t('analytics.backToCategories')}
              </button>
            ) : null}
          </div>

          {report.items?.length > 0 && categoryId ? (
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-start">
                  <tr>
                    <th className="px-4 py-3">{t('analytics.item')}</th>
                    <th className="px-4 py-3">{t('analytics.quantity')}</th>
                    <th className="px-4 py-3">{t('analytics.revenue')}</th>
                  </tr>
                </thead>
                <tbody>
                  {report.items.map((row) => (
                    <tr key={row.menuItemId} className="border-t border-slate-100">
                      <td className="px-4 py-3">{labelEntity(row, i18n.language)}</td>
                      <td className="px-4 py-3">{row.quantity}</td>
                      <td className="px-4 py-3">
                        {formatMoney(row.revenue, locale)} {t('pos.currency')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {report.categories?.length > 0 && !categoryId ? (
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-start">
                  <tr>
                    <th className="px-4 py-3">{t('analytics.category')}</th>
                    <th className="px-4 py-3">{t('analytics.revenue')}</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {report.categories.map((row) => (
                    <tr key={row.categoryId} className="border-t border-slate-100">
                      <td className="px-4 py-3">{labelEntity(row, i18n.language)}</td>
                      <td className="px-4 py-3">
                        {formatMoney(row.revenue, locale)} {t('pos.currency')}
                      </td>
                      <td className="px-4 py-3 text-end">
                        <button
                          type="button"
                          className="text-primary-from hover:underline"
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
          ) : null}
        </>
      ) : null}
    </div>
  );
}
