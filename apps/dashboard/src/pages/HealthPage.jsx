import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { isHubStaff } from '@venue-pos/shared';
import { apiFetch, apiFetchBlob } from '../api/client.js';
import { useAuth } from '../hooks/useAuth.js';

export function HealthPage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const [snapshot, setSnapshot] = useState(null);
  const [venues, setVenues] = useState([]);
  const [venueId, setVenueId] = useState(user?.venueId ?? '');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const canPickVenue = isHubStaff(user?.role);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      const scoped = canPickVenue ? venueId : user?.venueId;
      if (scoped) params.set('venueId', scoped);
      const qs = params.toString() ? `?${params}` : '';
      const [data, venueList] = await Promise.all([
        apiFetch(`/api/v1/manager/health${qs}`),
        canPickVenue ? apiFetch('/api/v1/venues') : Promise.resolve([]),
      ]);
      setSnapshot(data);
      if (canPickVenue) setVenues(venueList);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [canPickVenue, venueId, user?.venueId]);

  useEffect(() => {
    load();
    const id = setInterval(load, 60000);
    return () => clearInterval(id);
  }, [load]);

  async function exportCsv() {
    const params = new URLSearchParams({ format: 'csv' });
    const scoped = canPickVenue ? venueId : user?.venueId;
    if (scoped) params.set('venueId', scoped);
    const blob = await apiFetchBlob(`/api/v1/manager/health?${params}`);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'system-health.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">{t('health.title')}</h2>
          <p className="mt-1 text-sm text-secondary">{t('health.subtitle')}</p>
        </div>
        <button
          type="button"
          onClick={() => exportCsv().catch((e) => setError(e.message))}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50"
        >
          {t('health.exportCsv')}
        </button>
      </div>

      {canPickVenue && venues.length > 0 ? (
        <select
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
          value={venueId}
          onChange={(e) => setVenueId(e.target.value)}
        >
          <option value="">{t('orders.allVenues')}</option>
          {venues.map((v) => (
            <option key={v.id} value={v.id}>
              {i18n.language === 'ar' ? v.nameAr || v.nameEn : v.nameEn}
            </option>
          ))}
        </select>
      ) : null}

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700">{error}</div>
      ) : null}

      {loading && !snapshot ? (
        <p className="text-secondary">{t('common.loading')}</p>
      ) : snapshot ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs uppercase tracking-wide text-secondary">{t('health.onlineTerminals')}</p>
              <p className="mt-1 text-2xl font-bold text-emerald-700">
                {snapshot.summary.onlineCount}/{snapshot.summary.terminalCount}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs uppercase tracking-wide text-secondary">{t('health.pendingSync')}</p>
              <p className="mt-1 text-2xl font-bold text-slate-800">{snapshot.summary.pendingSyncTotal}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs uppercase tracking-wide text-secondary">{t('health.wsConnections')}</p>
              <p className="mt-1 text-2xl font-bold text-slate-800">{snapshot.summary.wsConnections.total}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs uppercase tracking-wide text-secondary">{t('health.memory')}</p>
              <p className="mt-1 text-2xl font-bold text-slate-800">
                {snapshot.server.memoryUsedPercent}%
              </p>
            </div>
          </div>

          {snapshot.alerts?.length > 0 ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <h3 className="font-semibold text-amber-900">{t('health.alerts')}</h3>
              <ul className="mt-2 space-y-1 text-sm text-amber-800">
                {snapshot.alerts.map((a) => (
                  <li key={a.terminalId}>{a.message}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="min-w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-secondary">
                <tr>
                  <th className="px-4 py-3">{t('health.terminal')}</th>
                  <th className="px-4 py-3">{t('health.venue')}</th>
                  <th className="px-4 py-3">{t('health.status')}</th>
                  <th className="px-4 py-3">{t('health.lastSeen')}</th>
                  <th className="px-4 py-3">{t('health.syncQueue')}</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.terminals.map((term) => (
                  <tr key={term.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-3 font-medium">{term.name ?? term.id}</td>
                    <td className="px-4 py-3">
                      {i18n.language === 'ar' ? term.venueNameAr : term.venueNameEn}
                    </td>
                    <td className="px-4 py-3">
                      <span className={term.online ? 'text-emerald-700' : 'text-red-600'}>
                        {term.online ? t('health.online') : t('health.offline')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-secondary">
                      {term.lastSeenAt
                        ? new Date(term.lastSeenAt).toLocaleString(i18n.language === 'ar' ? 'ar-EG' : 'en-GB')
                        : '—'}
                    </td>
                    <td className="px-4 py-3">{term.syncQueueDepth}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </div>
  );
}
