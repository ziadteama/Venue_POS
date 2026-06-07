import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiFetch, getToken } from '../api/client.js';
import { useAuth } from '../hooks/useAuth.js';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
const PAGE_SIZE = 50;

const emptyFilters = {
  status: '',
  cashier: '',
  from: '',
  to: '',
};

function formatMoney(value, locale) {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Number(value ?? 0));
}

function formatDate(value, locale) {
  if (!value) return '—';
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function labelVenue(row, language) {
  return language === 'ar' ? row.venueNameAr || row.venueNameEn : row.venueNameEn;
}

function overShortClass(amount) {
  if (amount == null || amount === 0) return 'text-slate-700';
  return amount > 0 ? 'text-emerald-700' : 'text-red-700';
}

function MethodBreakdown({ title, methods, t, locale }) {
  return (
    <div>
      <h4 className="text-xs font-semibold uppercase tracking-wide text-secondary">{title}</h4>
      <dl className="mt-2 grid gap-1 text-sm sm:grid-cols-3">
        {(['cash', 'card', 'voucher']).map((method) => (
          <div key={method}>
            <dt className="text-xs text-secondary">{t(`orders.method.${method}`)}</dt>
            <dd className="font-medium text-slate-800">
              {formatMoney(methods?.[method] ?? 0, locale)} {t('pos.currency')}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function ForceCloseModal({ shift, t, locale, onClose, onSuccess, setError }) {
  const [closeFloat, setCloseFloat] = useState('');
  const [managerPin, setManagerPin] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await apiFetch(`/api/v1/manager/shifts/${shift.id}/force-close`, {
        method: 'POST',
        body: JSON.stringify({
          closeFloat: Number(closeFloat),
          managerPin,
        }),
      });
      onSuccess();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <form
        onSubmit={submit}
        className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl"
      >
        <h3 className="text-lg font-semibold text-slate-900">{t('shifts.forceCloseTitle')}</h3>
        <p className="mt-2 text-sm text-secondary">
          {t('shifts.forceCloseHint', {
            cashier: shift.cashierUsername,
            expected: formatMoney(shift.expectedCash, locale),
          })}
        </p>
        <label className="mt-4 block text-sm">
          <span className="text-xs font-medium uppercase tracking-wide text-secondary">
            {t('shifts.closeFloat')}
          </span>
          <input
            type="number"
            min="0"
            step="0.01"
            required
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
            value={closeFloat}
            onChange={(e) => setCloseFloat(e.target.value)}
          />
        </label>
        <label className="mt-3 block text-sm">
          <span className="text-xs font-medium uppercase tracking-wide text-secondary">
            {t('shifts.managerPin')}
          </span>
          <input
            type="password"
            inputMode="numeric"
            required
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
            value={managerPin}
            onChange={(e) => setManagerPin(e.target.value)}
          />
        </label>
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm"
          >
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            {submitting ? t('common.loading') : t('shifts.forceClose')}
          </button>
        </div>
      </form>
    </div>
  );
}

export function ShiftsPage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const [venues, setVenues] = useState([]);
  const [venueId, setVenueId] = useState(user?.venueId ?? '');
  const [filters, setFilters] = useState(emptyFilters);
  const [page, setPage] = useState(1);
  const [result, setResult] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [forceCloseShift, setForceCloseShift] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const locale = i18n.language === 'ar' ? 'ar-EG' : 'en-EG';
  const isHub = user?.role === 'hub_manager';

  const query = useMemo(() => {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(PAGE_SIZE),
    });
    const scopedVenue = isHub ? venueId : user?.venueId;
    if (scopedVenue) params.set('venueId', scopedVenue);
    if (filters.status) params.set('status', filters.status);
    if (filters.cashier.trim()) params.set('cashier', filters.cashier.trim());
    if (filters.from) params.set('from', filters.from);
    if (filters.to) params.set('to', filters.to);
    return params.toString();
  }, [page, filters, isHub, venueId, user?.venueId]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [data, venueList] = await Promise.all([
        apiFetch(`/api/v1/manager/shifts?${query}`),
        isHub ? apiFetch('/api/v1/venues') : Promise.resolve([]),
      ]);
      setResult(data);
      if (isHub) setVenues(venueList);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [query, isHub]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const scopedVenue = isHub ? venueId : user?.venueId;
        const qs = scopedVenue ? `?venueId=${scopedVenue}` : '';
        const data = await apiFetch(`/api/v1/manager/shifts/${selectedId}${qs}`);
        if (!cancelled) setDetail(data);
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedId, isHub, venueId, user?.venueId]);

  const summary = useMemo(() => {
    if (!result?.shifts?.length) {
      return { open: 0, closed: 0, totalOverShort: 0 };
    }
    let open = 0;
    let closed = 0;
    let totalOverShort = 0;
    for (const row of result.shifts) {
      if (row.status === 'open') open += 1;
      else closed += 1;
      if (row.overShortAmount != null) totalOverShort += row.overShortAmount;
    }
    return { open, closed, totalOverShort };
  }, [result]);

  async function exportCsv() {
    const token = getToken();
    const res = await fetch(`${API_URL}/api/v1/manager/shifts?${query}&format=csv`, {
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error(t('shifts.exportFailed'));
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'shifts-export.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  function resetFilters() {
    setFilters(emptyFilters);
    setPage(1);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">{t('shifts.title')}</h2>
          <p className="mt-1 text-sm text-secondary">{t('shifts.subtitle')}</p>
        </div>
        <button
          type="button"
          onClick={() => exportCsv().catch((e) => setError(e.message))}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50"
        >
          {t('shifts.exportCsv')}
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-secondary">{t('shifts.openCount')}</p>
          <p className="mt-1 text-2xl font-bold text-amber-700">{summary.open}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-secondary">{t('shifts.closedCount')}</p>
          <p className="mt-1 text-2xl font-bold text-slate-800">{summary.closed}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-secondary">{t('shifts.pageOverShort')}</p>
          <p className={`mt-1 text-2xl font-bold ${overShortClass(summary.totalOverShort)}`}>
            {formatMoney(summary.totalOverShort, locale)} {t('pos.currency')}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        {isHub && venues.length > 0 ? (
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs font-medium uppercase tracking-wide text-secondary">
              {t('shifts.venue')}
            </span>
            <select
              className="min-w-[12rem] rounded-lg border border-slate-200 px-3 py-2"
              value={venueId}
              onChange={(e) => {
                setVenueId(e.target.value);
                setPage(1);
                setSelectedId(null);
              }}
            >
              <option value="">{t('orders.allVenues')}</option>
              {venues.map((v) => (
                <option key={v.id} value={v.id}>
                  {i18n.language === 'ar' ? v.nameAr || v.nameEn : v.nameEn}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs font-medium uppercase tracking-wide text-secondary">
            {t('shifts.status')}
          </span>
          <select
            className="min-w-[8rem] rounded-lg border border-slate-200 px-3 py-2"
            value={filters.status}
            onChange={(e) => {
              setFilters((f) => ({ ...f, status: e.target.value }));
              setPage(1);
            }}
          >
            <option value="">{t('shifts.allStatuses')}</option>
            <option value="open">{t('shifts.statusOpen')}</option>
            <option value="closed">{t('shifts.statusClosed')}</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs font-medium uppercase tracking-wide text-secondary">
            {t('shifts.cashier')}
          </span>
          <input
            type="search"
            className="min-w-[10rem] rounded-lg border border-slate-200 px-3 py-2"
            placeholder={t('shifts.cashierPlaceholder')}
            value={filters.cashier}
            onChange={(e) => setFilters((f) => ({ ...f, cashier: e.target.value }))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') setPage(1);
            }}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs font-medium uppercase tracking-wide text-secondary">
            {t('shifts.from')}
          </span>
          <input
            type="date"
            className="rounded-lg border border-slate-200 px-3 py-2"
            value={filters.from}
            onChange={(e) => {
              setFilters((f) => ({ ...f, from: e.target.value }));
              setPage(1);
            }}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs font-medium uppercase tracking-wide text-secondary">
            {t('shifts.to')}
          </span>
          <input
            type="date"
            className="rounded-lg border border-slate-200 px-3 py-2"
            value={filters.to}
            onChange={(e) => {
              setFilters((f) => ({ ...f, to: e.target.value }));
              setPage(1);
            }}
          />
        </label>
        <div className="flex items-end">
          <button
            type="button"
            onClick={resetFilters}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50"
          >
            {t('shifts.resetFilters')}
          </button>
        </div>
      </div>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          {loading ? (
            <p className="text-secondary">{t('common.loading')}</p>
          ) : !result?.shifts?.length ? (
            <p className="rounded-xl border border-slate-200 bg-white p-8 text-center text-secondary">
              {t('shifts.empty')}
            </p>
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <table className="min-w-full text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-start">
                  <tr>
                    <th className="px-3 py-2 font-medium text-secondary">{t('shifts.cashier')}</th>
                    {isHub ? (
                      <th className="px-3 py-2 font-medium text-secondary">{t('shifts.venue')}</th>
                    ) : null}
                    <th className="px-3 py-2 font-medium text-secondary">{t('shifts.terminal')}</th>
                    <th className="px-3 py-2 font-medium text-secondary">{t('shifts.status')}</th>
                    <th className="px-3 py-2 font-medium text-secondary">{t('shifts.openFloat')}</th>
                    <th className="px-3 py-2 font-medium text-secondary">{t('shifts.expected')}</th>
                    <th className="px-3 py-2 font-medium text-secondary">{t('shifts.overShort')}</th>
                    <th className="px-3 py-2 font-medium text-secondary">{t('shifts.openedAt')}</th>
                  </tr>
                </thead>
                <tbody>
                  {result.shifts.map((row) => (
                    <tr
                      key={row.id}
                      onClick={() => setSelectedId(row.id)}
                      className={`cursor-pointer border-b border-slate-100 hover:bg-slate-50 ${
                        selectedId === row.id ? 'bg-blue-50' : ''
                      }`}
                    >
                      <td className="px-3 py-2 font-medium">{row.cashierUsername}</td>
                      {isHub ? (
                        <td className="px-3 py-2">{labelVenue(row, i18n.language)}</td>
                      ) : null}
                      <td className="px-3 py-2">{row.terminalName}</td>
                      <td className="px-3 py-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            row.status === 'open'
                              ? 'bg-amber-100 text-amber-900'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {row.status === 'open' ? t('shifts.statusOpen') : t('shifts.statusClosed')}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        {formatMoney(row.openFloat, locale)} {t('pos.currency')}
                      </td>
                      <td className="px-3 py-2">
                        {formatMoney(row.expectedCash, locale)} {t('pos.currency')}
                      </td>
                      <td className={`px-3 py-2 font-medium ${overShortClass(row.overShortAmount)}`}>
                        {row.overShortAmount != null
                          ? `${formatMoney(row.overShortAmount, locale)} ${t('pos.currency')}`
                          : '—'}
                      </td>
                      <td className="px-3 py-2 text-secondary">{formatDate(row.openedAt, locale)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {result && result.totalPages > 1 ? (
            <div className="mt-4 flex items-center justify-between text-sm">
              <p className="text-secondary">
                {t('shifts.pageInfo', {
                  page: result.page,
                  totalPages: result.totalPages,
                  total: result.total,
                })}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="rounded border border-slate-300 px-3 py-1 disabled:opacity-40"
                >
                  {t('shifts.prev')}
                </button>
                <button
                  type="button"
                  disabled={page >= result.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="rounded border border-slate-300 px-3 py-1 disabled:opacity-40"
                >
                  {t('shifts.next')}
                </button>
              </div>
            </div>
          ) : null}
        </div>

        <div className="lg:col-span-2">
          {!detail ? (
            <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-secondary">
              {t('shifts.selectShift')}
            </div>
          ) : (
            <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-lg font-semibold">{detail.cashierUsername}</h3>
                  <p className="text-sm text-secondary">
                    {detail.terminalName}
                    {isHub ? ` · ${labelVenue(detail, i18n.language)}` : ''}
                  </p>
                </div>
                {detail.status === 'open' ? (
                  <button
                    type="button"
                    onClick={() => setForceCloseShift(detail)}
                    className="shrink-0 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700"
                  >
                    {t('shifts.forceClose')}
                  </button>
                ) : null}
              </div>

              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-xs uppercase tracking-wide text-secondary">{t('shifts.status')}</dt>
                  <dd className="font-medium">
                    {detail.status === 'open' ? t('shifts.statusOpen') : t('shifts.statusClosed')}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-secondary">{t('shifts.openFloat')}</dt>
                  <dd className="font-medium">
                    {formatMoney(detail.openFloat, locale)} {t('pos.currency')}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-secondary">{t('shifts.expected')}</dt>
                  <dd className="font-medium">
                    {formatMoney(detail.expectedCash, locale)} {t('pos.currency')}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-secondary">{t('shifts.closeFloat')}</dt>
                  <dd className="font-medium">
                    {detail.closeFloat != null
                      ? `${formatMoney(detail.closeFloat, locale)} ${t('pos.currency')}`
                      : '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-secondary">{t('shifts.overShort')}</dt>
                  <dd className={`font-medium ${overShortClass(detail.overShortAmount)}`}>
                    {detail.overShortAmount != null
                      ? `${formatMoney(detail.overShortAmount, locale)} ${t('pos.currency')}`
                      : '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-secondary">{t('shifts.totalRevenue')}</dt>
                  <dd className="font-medium">
                    {formatMoney(detail.totalRevenue, locale)} {t('pos.currency')}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-secondary">{t('shifts.openedAt')}</dt>
                  <dd>{formatDate(detail.openedAt, locale)}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-secondary">{t('shifts.closedAt')}</dt>
                  <dd>{formatDate(detail.closedAt, locale)}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-secondary">{t('shifts.paymentCount')}</dt>
                  <dd>{detail.paymentCount}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-secondary">{t('shifts.refundCount')}</dt>
                  <dd>{detail.refundCount}</dd>
                </div>
              </dl>

              <MethodBreakdown
                title={t('shifts.paymentsByMethod')}
                methods={detail.paymentsByMethod}
                t={t}
                locale={locale}
              />
              {detail.refundCount > 0 ? (
                <MethodBreakdown
                  title={t('shifts.refundsByMethod')}
                  methods={detail.refundsByMethod}
                  t={t}
                  locale={locale}
                />
              ) : null}
            </div>
          )}
        </div>
      </div>

      {forceCloseShift ? (
        <ForceCloseModal
          shift={forceCloseShift}
          t={t}
          locale={locale}
          onClose={() => setForceCloseShift(null)}
          onSuccess={() => {
            setSelectedId(forceCloseShift.id);
            load();
          }}
          setError={setError}
        />
      ) : null}
    </div>
  );
}
