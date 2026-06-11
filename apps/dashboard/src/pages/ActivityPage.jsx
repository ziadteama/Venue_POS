import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { isHubManager, canSeeFinancials } from '@venue-pos/shared';
import { apiFetch, apiFetchBlob } from '../api/client.js';
import { friendlyError } from '../utils/apiError.js';
import { useAuth } from '../hooks/useAuth.js';
import { PageHeader } from '../components/dashboard/PageHeader.jsx';
import { FilterBar, SearchInput } from '../components/ui/FilterBar.jsx';
import { Field, Input, Select } from '../components/ui/Field.jsx';
import { Button } from '../components/ui/Button.jsx';
import { SegmentedControl } from '../components/ui/SegmentedControl.jsx';
import { EmptyState } from '../components/ui/EmptyState.jsx';
import { PanelSkeleton } from '../components/dashboard/Skeleton.jsx';
import { DownloadIcon, ActivityIcon, AlertIcon } from '../components/dashboard/icons.jsx';

const TYPE_FILTERS = [
  'all',
  'discount',
  'refund',
  'void',
  'comp',
  'transfer',
  'config',
  'auth',
  'menu',
  'user',
  'shift_open',
  'shift_close',
  'check_print',
  'check_reprint',
  'check_pre_pay_adjust',
];

const TYPE_BADGE = {
  discount: 'bg-blue-100 text-blue-800 ring-blue-200',
  discount_change: 'bg-sky-100 text-sky-800 ring-sky-200',
  discount_remove: 'bg-slate-100 text-slate-800 ring-slate-200',
  refund: 'bg-amber-100 text-amber-900 ring-amber-200',
  void: 'bg-red-100 text-red-800 ring-red-200',
  comp: 'bg-violet-100 text-violet-800 ring-violet-200',
  transfer: 'bg-teal-100 text-teal-800 ring-teal-200',
  config: 'bg-slate-100 text-slate-800 ring-slate-200',
  auth: 'bg-indigo-100 text-indigo-800 ring-indigo-200',
  menu: 'bg-green-100 text-green-800 ring-green-200',
  user: 'bg-pink-100 text-pink-800 ring-pink-200',
  shift_open: 'bg-cyan-100 text-cyan-800 ring-cyan-200',
  shift_close: 'bg-cyan-100 text-cyan-800 ring-cyan-200',
  shift_force_close: 'bg-orange-100 text-orange-900 ring-orange-200',
  check_print: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
  check_reprint: 'bg-amber-100 text-amber-900 ring-amber-200',
  check_pre_pay_adjust: 'bg-orange-100 text-orange-900 ring-orange-200',
};

function typeLabel(type, t) {
  const key = `activity.type.${type}`;
  const label = t(key);
  return label === key ? type : label;
}

function formatWhen(iso, locale) {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(iso));
}

function dayHeading(iso, locale) {
  return new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(new Date(iso));
}

function groupByDay(events, locale) {
  const groups = [];
  const index = new Map();
  for (const ev of events) {
    const key = new Date(ev.at).toDateString();
    if (!index.has(key)) {
      index.set(key, groups.length);
      groups.push({ key, label: dayHeading(ev.at, locale), events: [] });
    }
    groups[index.get(key)].events.push(ev);
  }
  return groups;
}

function isReviewHighlight(ev) {
  return ev.amount != null && Boolean(ev.reason?.trim());
}

function ActivityRow({ ev, t, locale, currencyLabel, showAmounts }) {
  const badge = TYPE_BADGE[ev.type] ?? 'bg-slate-100 text-slate-800 ring-slate-200';
  const actor = ev.actor ?? ev.manager;
  const highlighted = isReviewHighlight(ev);

  return (
    <article
      className={`surface-card p-4 transition duration-200 ease-premium hover:border-slate-300/70 hover:shadow-card-hover ${
        highlighted ? 'border-amber-300 bg-amber-50/50 ring-1 ring-amber-200' : ''
      }`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-1 gap-3">
          <span
            className={`inline-flex h-fit shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${badge}`}
          >
            {typeLabel(ev.type, t)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-medium text-slate-900">{ev.summary ?? ev.detail}</p>
            {ev.chequeNumber != null ? (
              <p className="mt-1 text-sm text-slate-500">
                {t('activity.cheque')} #{ev.chequeNumber}
                {ev.venueName ? ` · ${ev.venueName}` : ''}
              </p>
            ) : ev.venueName ? (
              <p className="mt-1 text-sm text-slate-500">{ev.venueName}</p>
            ) : null}
            {ev.reason ? (
              <p className={`mt-1 text-sm ${highlighted ? 'font-medium text-amber-900' : 'text-slate-500'}`}>
                {t('activity.reason')}: {ev.reason}
              </p>
            ) : null}
          </div>
        </div>
        <div className="shrink-0 sm:text-end">
          {showAmounts && ev.amount != null ? (
            <p className="text-lg font-bold tabular-nums text-accent-700">
              {Number(ev.amount).toFixed(2)} {currencyLabel}
            </p>
          ) : null}
          <p className="mt-1 text-xs text-slate-400">{formatWhen(ev.at, locale)}</p>
          {actor ? (
            <p className="mt-1 text-xs font-medium text-slate-600">
              {t('activity.byManager', { name: actor })}
            </p>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export function ActivityPage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const [venues, setVenues] = useState([]);
  const [venueId, setVenueId] = useState('all');
  const [viewMode, setViewMode] = useState('needs_review');
  const [events, setEvents] = useState([]);
  const [typeFilter, setTypeFilter] = useState('all');
  const [userFilter, setUserFilter] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [keyword, setKeyword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const locale = i18n.language === 'ar' ? 'ar-EG' : 'en-GB';
  const currencyLabel = t('pos.currency');
  const showFinancials = canSeeFinancials(user);
  const effectiveType = viewMode === 'needs_review' ? 'needs_review' : typeFilter;

  const load = useCallback(async () => {
    if (!venueId) return;
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ venueId, limit: '100' });
      if (effectiveType !== 'all') params.set('type', effectiveType);
      if (userFilter.trim()) params.set('user', userFilter.trim());
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      if (keyword.trim()) params.set('q', keyword.trim());

      const [data, venueList] = await Promise.all([
        apiFetch(`/api/v1/manager/audit?${params}`),
        apiFetch('/api/v1/venues'),
      ]);
      setEvents(data.events ?? []);
      setVenues(venueList);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setLoading(false);
    }
  }, [venueId, effectiveType, userFilter, from, to, keyword]);

  useEffect(() => {
    if (!isHubManager(user?.role)) return;
    apiFetch('/api/v1/venues')
      .then((list) => {
        setVenues(list);
        if (!venueId && list[0]?.id) setVenueId('all');
      })
      .catch((e) => setError(friendlyError(e)));
  }, [user?.role, venueId]);

  useEffect(() => {
    if (!isHubManager(user?.role) || !venueId) return;
    load();
  }, [load, user?.role, venueId]);

  const grouped = useMemo(() => groupByDay(events, locale), [events, locale]);

  function resetFilters() {
    setTypeFilter('all');
    setUserFilter('');
    setFrom('');
    setTo('');
    setKeyword('');
  }

  async function exportCsv() {
    const params = new URLSearchParams({ venueId, format: 'csv' });
    if (effectiveType !== 'all') params.set('type', effectiveType);
    if (userFilter.trim()) params.set('user', userFilter.trim());
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (keyword.trim()) params.set('q', keyword.trim());
    const blob = await apiFetchBlob(`/api/v1/manager/audit?${params}`);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'audit-log.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!isHubManager(user?.role)) {
    return (
      <div className="surface-card p-8 text-center text-sm text-slate-500">
        {t('activity.hubManagerOnly')}
      </div>
    );
  }

  const typeOptions = TYPE_FILTERS.map((type) => ({
    value: type,
    label: type === 'all' ? t('activity.filterAll') : typeLabel(type, t),
  }));

  const viewOptions = [
    { value: 'needs_review', label: t('activity.viewNeedsReview') },
    { value: 'all', label: t('activity.viewAllActivity') },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('activity.title')}
        subtitle={
          viewMode === 'needs_review' ? t('activity.subtitleNeedsReview') : t('activity.subtitleFull')
        }
        actions={
          showFinancials ? (
            <Button variant="secondary" onClick={() => exportCsv().catch((e) => setError(friendlyError(e)))}>
              <DownloadIcon className="h-4 w-4" />
              {t('activity.exportCsv')}
            </Button>
          ) : null
        }
      />

      <FilterBar
        onReset={resetFilters}
        resetLabel={t('common.reset')}
        moreLabel={t('common.moreFilters')}
        primary={
          <>
            {venues.length > 0 ? (
              <Select className="w-auto py-2" value={venueId} onChange={(e) => setVenueId(e.target.value)}>
                <option value="all">{t('activity.allVenues')}</option>
                {venues.map((v) => (
                  <option key={v.id} value={v.id}>
                    {i18n.language === 'ar' ? v.nameAr : v.nameEn}
                  </option>
                ))}
              </Select>
            ) : null}
            <SearchInput
              value={keyword}
              onChange={setKeyword}
              placeholder={t('activity.searchPlaceholder')}
              className="w-full sm:w-64"
            />
          </>
        }
        advanced={
          <>
            <Field label={t('activity.userFilter')}>
              <Input
                value={userFilter}
                onChange={(e) => setUserFilter(e.target.value)}
                placeholder={t('activity.userPlaceholder')}
              />
            </Field>
            <Field label={t('activity.from')}>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </Field>
            <Field label={t('activity.to')}>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </Field>
          </>
        }
      />

      <SegmentedControl variant="pill" options={viewOptions} value={viewMode} onChange={setViewMode} />

      {viewMode === 'all' ? (
        <SegmentedControl variant="pill" options={typeOptions} value={typeFilter} onChange={setTypeFilter} />
      ) : null}

      {error ? (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          <AlertIcon className="h-5 w-5 shrink-0" />
          {error}
        </div>
      ) : null}

      {loading ? (
        <PanelSkeleton rows={5} />
      ) : events.length === 0 ? (
        <div className="surface-card">
          <EmptyState
            icon={ActivityIcon}
            title={viewMode === 'needs_review' ? t('activity.emptyNeedsReview') : t('activity.empty')}
            className="py-16"
          />
        </div>
      ) : (
        <div className="space-y-8">
          {grouped.map((group) => (
            <section key={group.key}>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
                {group.label}
              </h3>
              <div className="space-y-3">
                {group.events.map((ev) => (
                  <ActivityRow
                    key={ev.id}
                    ev={ev}
                    t={t}
                    locale={locale}
                    currencyLabel={currencyLabel}
                    showAmounts={showFinancials}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
