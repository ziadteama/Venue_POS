import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiFetch } from '../api/client.js';
import { useAuth } from '../hooks/useAuth.js';

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

export function ActivityPage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const [venues, setVenues] = useState([]);
  const [venueId, setVenueId] = useState(user?.venueId ?? '');
  const [events, setEvents] = useState([]);
  const [error, setError] = useState('');

  const listQuery = venueId ? `?venueId=${venueId}&limit=100` : '?limit=100';

  const load = useCallback(async () => {
    setError('');
    const [list, venueList] = await Promise.all([
      apiFetch(`/api/v1/manager/activity${listQuery}`),
      apiFetch('/api/v1/venues'),
    ]);
    setEvents(list);
    setVenues(venueList);
    if (!venueId && venueList[0]) setVenueId(venueList[0].id);
  }, [listQuery, venueId]);

  useEffect(() => {
    if (user?.role !== 'hub_manager') return;
    load().catch((e) => setError(e.message));
  }, [load, user?.role]);

  if (user?.role !== 'hub_manager') {
    return <p className="text-secondary">{t('activity.hubManagerOnly')}</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">{t('activity.title')}</h2>
          <p className="text-sm text-secondary">{t('activity.subtitle')}</p>
        </div>
        {venues.length > 1 && (
          <select
            className="rounded border px-3 py-2 text-sm"
            value={venueId}
            onChange={(e) => setVenueId(e.target.value)}
          >
            {venues.map((v) => (
              <option key={v.id} value={v.id}>
                {i18n.language === 'ar' ? v.nameAr : v.nameEn}
              </option>
            ))}
          </select>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700">
          {error}
        </div>
      )}

      {events.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-secondary">
          {t('activity.empty')}
        </div>
      ) : (
        <ul className="space-y-2">
          {events.map((ev) => (
            <li
              key={`${ev.type}-${ev.id}`}
              className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-slate-900">
                    {typeLabel(ev.type, t)}
                    {ev.chequeNumber != null
                      ? ` — ${t('cheque.number', { number: ev.chequeNumber })}`
                      : ''}
                  </p>
                  <p className="text-secondary">
                    {ev.tableLabel ? t('cheque.table', { label: ev.tableLabel }) : ''}
                    {ev.detail ? ` · ${ev.detail}` : ''}
                  </p>
                  <p className="mt-1 text-slate-700">{ev.reason}</p>
                </div>
                <div className="text-end text-secondary">
                  {ev.amount != null && (
                    <p className="font-semibold text-primary-to">
                      {ev.amount.toFixed(2)} {t('pos.currency')}
                    </p>
                  )}
                  <p className="text-xs">
                    {t('activity.byManager', { name: ev.manager })}
                  </p>
                  <p className="text-xs">{new Date(ev.at).toLocaleString()}</p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
