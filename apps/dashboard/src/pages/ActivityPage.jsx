import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiFetch, getToken } from '../api/client.js';
import { useAuth } from '../hooks/useAuth.js';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

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
];

const TYPE_BADGE = {
  discount: 'bg-blue-100 text-blue-800 ring-blue-200',
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

function ActivityRow({ ev, t, locale, currencyLabel }) {
  const badge = TYPE_BADGE[ev.type] ?? 'bg-slate-100 text-slate-800 ring-slate-200';
  const actor = ev.actor ?? ev.manager;

  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
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
              <p className="mt-1 text-sm text-secondary">
                {t('activity.cheque')} #{ev.chequeNumber}
              </p>
            ) : null}
            {ev.reason ? (
              <p className="mt-1 text-sm text-secondary">
                {t('activity.reason')}: {ev.reason}
              </p>
            ) : null}
          </div>
        </div>
        <div className="shrink-0 sm:text-end">
          {ev.amount != null ? (
            <p className="text-lg font-bold text-primary-to">
              {Number(ev.amount).toFixed(2)} {currencyLabel}
            </p>
          ) : null}
          <p className="mt-1 text-xs text-secondary">{formatWhen(ev.at, locale)}</p>
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
  const [venueId, setVenueId] = useState('');
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

  const load = useCallback(async () => {
    if (!venueId) return;
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ venueId, limit: '100' });
      if (typeFilter !== 'all') params.set('type', typeFilter);
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
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [venueId, typeFilter, userFilter, from, to, keyword]);

  useEffect(() => {
    if (user?.role !== 'hub_manager') return;
    apiFetch('/api/v1/venues')
      .then((list) => {
        setVenues(list);
        if (!venueId && list[0]?.id) setVenueId(list[0].id);
      })
      .catch((e) => setError(e.message));
  }, [user?.role, venueId]);

  useEffect(() => {
    if (user?.role !== 'hub_manager' || !venueId) return;
    load();
  }, [load, user?.role, venueId]);

  const grouped = useMemo(() => groupByDay(events, locale), [events, locale]);

  async function exportCsv() {
    const token = getToken();
    const params = new URLSearchParams({ venueId, format: 'csv' });
    if (typeFilter !== 'all') params.set('type', typeFilter);
    if (userFilter.trim()) params.set('user', userFilter.trim());
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (keyword.trim()) params.set('q', keyword.trim());
    const res = await fetch(`${API_URL}/api/v1/manager/audit?${params}`, {
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error(t('activity.exportFailed'));
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'audit-log.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  if (user?.role !== 'hub_manager') {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-secondary">
        {t('activity.hubManagerOnly')}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">{t('activity.title')}</h2>
          <p className="mt-1 max-w-2xl text-sm text-secondary">{t('activity.subtitleFull')}</p>
        </div>
        <button
          type="button"
          onClick={() => exportCsv().catch((e) => setError(e.message))}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50"
        >
          {t('activity.exportCsv')}
        </button>
      </div>

      <div className="flex flex-wrap gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        {venues.length > 0 ? (
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs font-medium uppercase tracking-wide text-secondary">
              {t('activity.venue')}
            </span>
            <select
              className="min-w-[12rem] rounded-lg border border-slate-200 px-3 py-2"
              value={venueId}
              onChange={(e) => setVenueId(e.target.value)}
            >
              {venues.map((v) => (
                <option key={v.id} value={v.id}>
                  {i18n.language === 'ar' ? v.nameAr : v.nameEn}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs font-medium uppercase tracking-wide text-secondary">{t('activity.userFilter')}</span>
          <input
            className="rounded-lg border border-slate-200 px-3 py-2"
            value={userFilter}
            onChange={(e) => setUserFilter(e.target.value)}
            placeholder={t('activity.userPlaceholder')}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs font-medium uppercase tracking-wide text-secondary">{t('activity.from')}</span>
          <input type="date" className="rounded-lg border px-3 py-2" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs font-medium uppercase tracking-wide text-secondary">{t('activity.to')}</span>
          <input type="date" className="rounded-lg border px-3 py-2" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-sm sm:min-w-[12rem]">
          <span className="text-xs font-medium uppercase tracking-wide text-secondary">{t('activity.search')}</span>
          <input
            className="rounded-lg border border-slate-200 px-3 py-2"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder={t('activity.searchPlaceholder')}
          />
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        {TYPE_FILTERS.map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => setTypeFilter(type)}
            className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
              typeFilter === type
                ? 'bg-primary-gradient text-white shadow-sm'
                : 'bg-white text-secondary ring-1 ring-slate-200 hover:bg-slate-50'
            }`}
          >
            {type === 'all' ? t('activity.filterAll') : typeLabel(type, t)}
          </button>
        ))}
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700">{error}</div>
      ) : null}

      {loading ? (
        <p className="text-secondary">{t('common.loading')}</p>
      ) : events.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-white p-10 text-center">
          <p className="font-medium text-slate-900">{t('activity.empty')}</p>
        </div>
      ) : (
        <div className="space-y-8">
          {grouped.map((group) => (
            <section key={group.key}>
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-secondary">{group.label}</h3>
              <div className="space-y-3">
                {group.events.map((ev) => (
                  <ActivityRow
                    key={ev.id}
                    ev={ev}
                    t={t}
                    locale={locale}
                    currencyLabel={currencyLabel}
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
