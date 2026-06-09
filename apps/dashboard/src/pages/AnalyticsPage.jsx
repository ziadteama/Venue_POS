import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { isHubStaff } from '@venue-pos/shared';
import { apiFetch, apiFetchBlob } from '../api/client.js';
import { friendlyError } from '../utils/apiError.js';
import { useAuth } from '../hooks/useAuth.js';
import { PageHeader } from '../components/dashboard/PageHeader.jsx';
import { StatCard } from '../components/dashboard/StatCard.jsx';
import { StatCardSkeleton, ChartSkeleton } from '../components/dashboard/Skeleton.jsx';
import { SectionCard } from '../components/ui/Card.jsx';
import { SegmentedControl } from '../components/ui/SegmentedControl.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Field, Input, Select } from '../components/ui/Field.jsx';
import { DataTable } from '../components/ui/DataTable.jsx';
import { EmptyState } from '../components/ui/EmptyState.jsx';
import { DownloadIcon, AnalyticsIcon, AlertIcon } from '../components/dashboard/icons.jsx';
import { formatMoney } from '../utils/dashboardFormat.js';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
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

  const canDrill = Boolean(report?.drillVenueId) && !categoryId;

  const chartTitle = categoryId
    ? t('analytics.item')
    : report?.drillVenueId
      ? t('analytics.itemsChart')
      : t('analytics.revenueChart');

  const maxCategoryRevenue = useMemo(
    () => Math.max(1, ...(report?.categories ?? []).map((r) => Number(r.revenue ?? 0))),
    [report?.categories],
  );

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

  const presetOptions = PRESETS.map((key) => ({ value: key, label: t(`analytics.preset.${key}`) }));
  const showSkeleton = loading && !report && customRangeReady;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('analytics.title')}
        subtitle={t('analytics.subtitle')}
        actions={
          <Button
            variant="secondary"
            onClick={() => exportCsv().catch((e) => setError(friendlyError(e)))}
            disabled={!customRangeReady || !report}
          >
            <DownloadIcon className="h-4 w-4" />
            {t('analytics.exportCsv')}
          </Button>
        }
      />

      <section className="surface-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SegmentedControl
            variant="pill"
            options={presetOptions}
            value={preset}
            onChange={(value) => {
              setPreset(value);
              setCategoryId('');
            }}
          />
          {canPickVenue && venues.length > 1 ? (
            <Select
              className="w-auto py-2"
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
            </Select>
          ) : null}
        </div>

        {preset === 'custom' ? (
          <div className="mt-4 grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-2 lg:max-w-md">
            <Field label={t('analytics.from')}>
              <Input
                type="date"
                value={customFrom}
                max={customTo || undefined}
                onChange={(e) => setCustomFrom(e.target.value)}
              />
            </Field>
            <Field label={t('analytics.to')}>
              <Input
                type="date"
                value={customTo}
                min={customFrom || undefined}
                onChange={(e) => setCustomTo(e.target.value)}
              />
            </Field>
          </div>
        ) : null}
      </section>

      {error ? (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          <AlertIcon className="h-5 w-5 shrink-0" />
          {error}
        </div>
      ) : null}

      {showSkeleton ? (
        <>
          <section className="grid gap-4 sm:grid-cols-2">
            <StatCardSkeleton />
            <StatCardSkeleton />
          </section>
          <ChartSkeleton />
        </>
      ) : preset === 'custom' && !customRangeReady ? (
        <SectionCard>
          <EmptyState icon={AnalyticsIcon} title={t('analytics.customHint')} />
        </SectionCard>
      ) : report ? (
        <>
          <section className="grid gap-4 sm:grid-cols-2">
            <StatCard
              label={t('analytics.totalRevenue')}
              value={formatMoney(report.totalRevenue, locale, currencyLabel)}
              icon={AnalyticsIcon}
              tone="emerald"
            />
            {report.comparison ? (
              <StatCard
                label={t('analytics.vsPrevious')}
                value={formatMoney(report.comparison.previous, locale, currencyLabel)}
                tone="blue"
                trend={{
                  changePercent: report.comparison.changePercent,
                  changeAmount: report.comparison.changeAmount,
                  locale,
                  currencyLabel,
                }}
              />
            ) : null}
          </section>

          <SectionCard
            title={chartTitle}
            hint={canDrill ? t('analytics.drillHint') : undefined}
            action={
              categoryId ? (
                <Button variant="subtle" size="sm" onClick={() => setCategoryId('')}>
                  {t('analytics.backToCategories')}
                </Button>
              ) : null
            }
          >
            {chartData.length === 0 ? (
              <EmptyState icon={AnalyticsIcon} title={t('analytics.noData')} />
            ) : (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                    <defs>
                      <linearGradient id="analyticsBar" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10b981" />
                        <stop offset="100%" stopColor="#059669" />
                      </linearGradient>
                    </defs>
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
                      cursor={{ fill: 'rgba(16,185,129,0.06)' }}
                      formatter={(value) => formatMoney(value, locale, currencyLabel)}
                      contentStyle={{
                        borderRadius: 12,
                        border: '1px solid #e2e8f0',
                        boxShadow: '0 14px 30px -10px rgba(15,23,42,0.18)',
                      }}
                    />
                    <Bar
                      dataKey="revenue"
                      fill="url(#analyticsBar)"
                      radius={[6, 6, 0, 0]}
                      maxBarSize={48}
                      cursor={canDrill ? 'pointer' : undefined}
                      onClick={(data) => {
                        if (!canDrill) return;
                        if (data?.payload?.id) setCategoryId(data.payload.id);
                      }}
                    >
                      {chartData.map((entry) => (
                        <Cell key={entry.id} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </SectionCard>

          {!categoryId && report.categories?.length > 0 ? (
            <SectionCard title={t('analytics.category')} flush>
              <DataTable
                columns={[
                  {
                    key: 'name',
                    header: t('analytics.category'),
                    render: (row) => (
                      <span className="font-medium text-slate-900">
                        {labelEntity(row, i18n.language)}
                      </span>
                    ),
                  },
                  {
                    key: 'bar',
                    header: t('analytics.revenue'),
                    cellClassName: 'w-1/2',
                    render: (row) => (
                      <div className="flex items-center gap-3">
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-full rounded-full bg-accent-gradient"
                            style={{
                              width: `${Math.max(4, (Number(row.revenue ?? 0) / maxCategoryRevenue) * 100)}%`,
                            }}
                          />
                        </div>
                        <span className="w-28 text-end tabular-nums text-slate-700">
                          {formatMoney(row.revenue, locale, currencyLabel)}
                        </span>
                      </div>
                    ),
                  },
                  {
                    key: 'action',
                    header: '',
                    align: 'end',
                    render: (row) => (
                      <Button variant="subtle" size="sm" onClick={() => setCategoryId(row.categoryId)}>
                        {t('analytics.drillDown')}
                      </Button>
                    ),
                  },
                ]}
                rows={report.categories}
                rowKey={(row) => row.categoryId}
              />
            </SectionCard>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
