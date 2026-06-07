import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { isCeo } from '@venue-pos/shared';
import { apiFetch } from '../api/client.js';
import { useAuth } from '../hooks/useAuth.js';

function formatWhen(iso, locale) {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(iso));
}

function formatMoney(value, locale) {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Number(value ?? 0));
}

export function ApprovalsPage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const [venues, setVenues] = useState([]);
  const [venueId, setVenueId] = useState('');
  const [requests, setRequests] = useState([]);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [loading, setLoading] = useState(true);

  const locale = i18n.language === 'ar' ? 'ar-EG' : 'en-EG';

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ status: 'pending', type: 'refund' });
      if (venueId) params.set('venueId', venueId);
      const [list, venueList] = await Promise.all([
        apiFetch(`/api/v1/manager/approvals?${params}`),
        apiFetch('/api/v1/venues'),
      ]);
      setRequests(list);
      setVenues(venueList);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [venueId]);

  useEffect(() => {
    if (!isCeo(user?.role)) return;
    load();
  }, [load, user?.role]);

  const venueName = useMemo(() => {
    const map = new Map(venues.map((v) => [v.id, i18n.language === 'ar' ? v.nameAr : v.nameEn]));
    return (id) => map.get(id) ?? id;
  }, [venues, i18n.language]);

  async function approve(id) {
    setBusyId(id);
    setError('');
    try {
      await apiFetch(`/api/v1/manager/approvals/${id}/approve`, { method: 'POST', body: '{}' });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function submitReject(e) {
    e.preventDefault();
    if (!rejectTarget || !rejectReason.trim()) return;
    setBusyId(rejectTarget.id);
    setError('');
    try {
      await apiFetch(`/api/v1/manager/approvals/${rejectTarget.id}/reject`, {
        method: 'POST',
        body: JSON.stringify({ rejectReason: rejectReason.trim() }),
      });
      setRejectTarget(null);
      setRejectReason('');
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  if (!isCeo(user?.role)) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-secondary">
        {t('approvals.ceoOnly')}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-900">{t('approvals.title')}</h2>
        <p className="mt-1 text-sm text-secondary">{t('approvals.subtitle')}</p>
      </div>

      {venues.length > 0 && (
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs font-medium uppercase tracking-wide text-secondary">
            {t('approvals.venue')}
          </span>
          <select
            className="min-w-[12rem] rounded-lg border border-slate-200 px-3 py-2"
            value={venueId}
            onChange={(e) => setVenueId(e.target.value)}
          >
            <option value="">{t('approvals.allVenues')}</option>
            {venues.map((v) => (
              <option key={v.id} value={v.id}>
                {i18n.language === 'ar' ? v.nameAr || v.nameEn : v.nameEn}
              </option>
            ))}
          </select>
        </label>
      )}

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="text-secondary">{t('common.loading')}</p>
      ) : requests.length === 0 ? (
        <p className="rounded-xl border border-slate-200 bg-white p-8 text-center text-secondary">
          {t('approvals.empty')}
        </p>
      ) : (
        <div className="space-y-3">
          {requests.map((row) => (
            <article
              key={row.id}
              className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="font-semibold text-slate-900">
                    {t('approvals.refundRequest', { number: row.chequeNumber })}
                  </p>
                  <p className="text-sm text-secondary">
                    {venueName(row.venueId)}
                    {row.tableLabel ? ` · ${row.tableLabel}` : ''}
                  </p>
                  <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-secondary">
                        {t('approvals.amount')}
                      </dt>
                      <dd className="font-medium">
                        {formatMoney(row.payload?.amount, locale)} {t('pos.currency')} (
                        {row.payload?.method})
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-secondary">
                        {t('approvals.requestedBy')}
                      </dt>
                      <dd>{row.initiatorUsername}</dd>
                    </div>
                    <div className="sm:col-span-2">
                      <dt className="text-xs uppercase tracking-wide text-secondary">
                        {t('approvals.reason')}
                      </dt>
                      <dd className="text-slate-700">{row.reason}</dd>
                    </div>
                  </dl>
                  <p className="mt-2 text-xs text-secondary">{formatWhen(row.createdAt, locale)}</p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    disabled={busyId === row.id}
                    onClick={() => approve(row.id)}
                    className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {t('approvals.approve')}
                  </button>
                  <button
                    type="button"
                    disabled={busyId === row.id}
                    onClick={() => {
                      setRejectTarget(row);
                      setRejectReason('');
                    }}
                    className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                  >
                    {t('approvals.reject')}
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {rejectTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form
            onSubmit={submitReject}
            className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl"
          >
            <h3 className="text-lg font-semibold">{t('approvals.rejectTitle')}</h3>
            <p className="mt-2 text-sm text-secondary">
              {t('approvals.rejectHint', { number: rejectTarget.chequeNumber })}
            </p>
            <label className="mt-4 block text-sm">
              <span className="text-xs font-medium uppercase tracking-wide text-secondary">
                {t('approvals.rejectReason')}
              </span>
              <textarea
                required
                rows={3}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
              />
            </label>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRejectTarget(null)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm"
              >
                {t('common.cancel')}
              </button>
              <button
                type="submit"
                disabled={busyId === rejectTarget.id}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {t('approvals.confirmReject')}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
