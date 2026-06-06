import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiFetch } from '../api/client.js';
import { useAuth } from '../hooks/useAuth.js';

export function ApprovalsPage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const [venues, setVenues] = useState([]);
  const [venueId, setVenueId] = useState(user?.venueId ?? '');
  const [requests, setRequests] = useState([]);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);

  const venueQuery = venueId ? `?venueId=${venueId}` : '';
  const listQuery = venueId
    ? `?venueId=${venueId}&status=pending`
    : '?status=pending';

  const load = useCallback(async () => {
    setError('');
    const [list, venueList] = await Promise.all([
      apiFetch(`/api/v1/manager/approval-requests${listQuery}`),
      apiFetch('/api/v1/venues'),
    ]);
    setRequests(list);
    setVenues(venueList);
    if (!venueId && venueList[0]) setVenueId(venueList[0].id);
  }, [listQuery, venueId]);

  useEffect(() => {
    if (user?.role !== 'hub_manager') return;
    load().catch((e) => setError(e.message));
  }, [load, user?.role]);

  useEffect(() => {
    if (user?.role !== 'hub_manager') return;
    const timer = setInterval(() => {
      load().catch(() => {});
    }, 5000);
    return () => clearInterval(timer);
  }, [load, user?.role]);

  async function approve(id) {
    setBusyId(id);
    setError('');
    try {
      await apiFetch(`/api/v1/manager/approval-requests/${id}/approve${venueQuery}`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusyId(null);
    }
  }

  async function reject(id) {
    const rejectReason = window.prompt(t('approval.rejectPrompt'));
    if (rejectReason == null) return;
    setBusyId(id);
    setError('');
    try {
      await apiFetch(`/api/v1/manager/approval-requests/${id}/reject${venueQuery}`, {
        method: 'POST',
        body: JSON.stringify({ rejectReason }),
      });
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusyId(null);
    }
  }

  if (user?.role !== 'hub_manager') {
    return (
      <p className="text-secondary">{t('approval.hubManagerOnly')}</p>
    );
  }

  function labelForType(type) {
    return type === 'discount' ? t('approval.typeDiscount') : t('approval.typeRefund');
  }

  function amountLabel(req) {
    if (req.type === 'discount') {
      if (req.payload?.percent) {
        return `${req.payload.percent}%`;
      }
      return `${Number(req.payload?.amount ?? 0).toFixed(2)} ${t('pos.currency')}`;
    }
    return `${Number(req.payload?.amount ?? 0).toFixed(2)} ${t('pos.currency')} (${req.payload?.method ?? 'cash'})`;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">{t('approval.title')}</h2>
          <p className="text-sm text-secondary">{t('approval.subtitle')}</p>
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

      {requests.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-secondary">
          {t('approval.empty')}
        </div>
      ) : (
        <ul className="space-y-3">
          {requests.map((req) => (
            <li
              key={req.id}
              className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-900">
                    {labelForType(req.type)} — {t('cheque.number', { number: req.chequeNumber })}
                  </p>
                  <p className="text-sm text-secondary">
                    {t('cheque.table', { label: req.tableLabel })} ·{' '}
                    {t('approval.requestedBy', { name: req.initiatorName })}
                  </p>
                  <p className="mt-1 text-sm">{req.reason}</p>
                </div>
                <div className="text-end">
                  <p className="text-lg font-bold text-primary-to">{amountLabel(req)}</p>
                  <p className="text-xs text-secondary">
                    {new Date(req.createdAt).toLocaleString()}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={busyId === req.id}
                  onClick={() => approve(req.id)}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {busyId === req.id ? t('common.loading') : t('approval.approve')}
                </button>
                <button
                  type="button"
                  disabled={busyId === req.id}
                  onClick={() => reject(req.id)}
                  className="rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
                >
                  {t('approval.reject')}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
