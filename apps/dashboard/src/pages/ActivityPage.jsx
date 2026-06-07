import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiFetch } from '../api/client.js';
import { useAuth } from '../hooks/useAuth.js';

const TYPE_FILTERS = ['all', 'discount', 'refund', 'void', 'comp', 'transfer'];

const TYPE_BADGE = {
  discount: 'bg-blue-100 text-blue-800 ring-blue-200',
  refund: 'bg-amber-100 text-amber-900 ring-amber-200',
  void: 'bg-red-100 text-red-800 ring-red-200',
  comp: 'bg-violet-100 text-violet-800 ring-violet-200',
  transfer: 'bg-teal-100 text-teal-800 ring-teal-200',
};

function typeLabel(type, t) {
  const map = {
    discount: t('activity.typeDiscount'),
    refund: t('activity.typeRefund'),
    comp: t('activity.typeComp'),
    void: t('activity.typeVoid'),
    transfer: t('activity.typeTransfer'),
  };
  return map[type] ?? type;
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
            <p className="font-medium text-slate-900">{t(`activity.summary.${ev.type}`, ev)}</p>
            <dl className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
              {ev.chequeNumber != null ? (
                <div>
                  <dt className="text-xs uppercase tracking-wide text-secondary">{t('activity.cheque')}</dt>
                  <dd className="text-slate-800">#{ev.chequeNumber}</dd>
                </div>
              ) : null}
              {ev.tableLabel ? (
                <div>
                  <dt className="text-xs uppercase tracking-wide text-secondary">{t('activity.table')}</dt>
                  <dd className="text-slate-800">{ev.tableLabel}</dd>
                </div>
              ) : null}
              {ev.detail ? (
                <div className="sm:col-span-2">
                  <dt className="text-xs uppercase tracking-wide text-secondary">{t('activity.detail')}</dt>
                  <dd className="text-slate-800">{ev.detail}</dd>
                </div>
              ) : null}
              <div className="sm:col-span-2">
                <dt className="text-xs uppercase tracking-wide text-secondary">{t('activity.reason')}</dt>
                <dd className="text-slate-700">{ev.reason}</dd>
              </div>
            </dl>
          </div>
        </div>
        <div className="shrink-0 sm:border-s sm:border-slate-100 sm:ps-4 sm:text-end">
          {ev.amount != null ? (
            <p className="text-lg font-bold text-primary-to">
              {Number(ev.amount).toFixed(2)} {currencyLabel}
            </p>
          ) : (
            <p className="text-sm text-secondary">{t('activity.noAmount')}</p>
          )}
          <p className="mt-1 text-xs text-secondary">{formatWhen(ev.at, locale)}</p>
          <p className="mt-1 text-xs font-medium text-slate-600">
            {t('activity.byManager', { name: ev.manager })}
          </p>
        </div>
      </div>
    </article>
  );
}

export function ActivityPage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const [venues, setVenues] = useState([]);
  const [venueId, setVenueId] = useState(user?.venueId ?? '');
  const [events, setEvents] = useState([]);
  const [typeFilter, setTypeFilter] = useState('all');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const locale = i18n.language === 'ar' ? 'ar-EG' : 'en-GB';
  const currencyLabel = t('pos.currency');

  const load = useCallback(async () => {
    if (!venueId) return;
    setLoading(true);
    setError('');
    try {
      const [list, venueList] = await Promise.all([
        apiFetch(`/api/v1/manager/activity?venueId=${venueId}&limit=100`),
        apiFetch('/api/v1/venues'),
      ]);
      setEvents(list);
      setVenues(venueList);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [venueId]);

  useEffect(() => {
    if (user?.role !== 'hub_manager') return;
    if (!venueId && user?.venueId) setVenueId(user.venueId);
  }, [user?.role, user?.venueId, venueId]);

  useEffect(() => {
    if (user?.role !== 'hub_manager' || !venueId) return;
    load();
  }, [load, user?.role, venueId]);

  useEffect(() => {
    if (venues.length && !venueId) setVenueId(venues[0].id);
  }, [venues, venueId]);

  const filtered = useMemo(() => {
    if (typeFilter === 'all') return events;
    return events.filter((ev) => ev.type === typeFilter);
  }, [events, typeFilter]);

  const typeCounts = useMemo(() => {
    const counts = { all: events.length };
    for (const type of TYPE_FILTERS) {
      if (type === 'all') continue;
      counts[type] = events.filter((ev) => ev.type === type).length;
    }
    return counts;
  }, [events]);

  const grouped = useMemo(() => groupByDay(filtered, locale), [filtered, locale]);

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
          <p className="mt-1 max-w-2xl text-sm text-secondary">{t('activity.subtitle')}</p>
        </div>
        {venues.length > 0 && (
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs font-medium uppercase tracking-wide text-secondary">
              {t('activity.venue')}
            </span>
            <select
              className="min-w-[12rem] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm"
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
        )}
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
            <span className="ms-1.5 opacity-80">({typeCounts[type] ?? 0})</span>
          </button>
        ))}
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700">{error}</div>
      ) : null}

      {loading ? (
        <p className="text-secondary">{t('common.loading')}</p>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-white p-10 text-center">
          <p className="font-medium text-slate-900">{t('activity.empty')}</p>
          <p className="mt-1 text-sm text-secondary">{t('activity.emptyHint')}</p>
        </div>
      ) : (
        <div className="space-y-8">
          {grouped.map((group) => (
            <section key={group.key}>
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-secondary">
                {group.label}
              </h3>
              <div className="space-y-3">
                {group.events.map((ev) => (
                  <ActivityRow
                    key={`${ev.type}-${ev.id}`}
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
