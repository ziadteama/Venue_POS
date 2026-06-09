import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ORDER_STATUSES, isHubStaff } from '@venue-pos/shared';
import { apiFetch, apiFetchBlob } from '../api/client.js';
import { friendlyError } from '../utils/apiError.js';
import { useAuth } from '../hooks/useAuth.js';
import { CrossVenueBadge, CrossVenueGroupPanel } from '../components/CrossVenueBadge.jsx';

const PAGE_SIZE = 50;

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

function labelEntity(row, language, enKey = 'nameEn', arKey = 'nameAr') {
  return language === 'ar' ? row[arKey] || row[enKey] : row[enKey];
}

const emptyFilters = {
  q: '',
  orderNumber: '',
  chequeNumber: '',
  tableLabel: '',
  cashier: '',
  status: '',
  paymentMethod: '',
  from: '',
  to: '',
  minAmount: '',
  maxAmount: '',
};

function lineItemTotal(item) {
  if (item.isComped) return 0;
  const mods =
    item.modifiersSnapshot?.reduce((s, m) => s + Number(m.priceDelta ?? 0), 0) ?? 0;
  return (item.unitPrice + mods) * item.quantity;
}

function OrderLineItems({ items, t, i18n, locale }) {
  const lines = items ?? [];
  if (!lines.length) {
    return <p className="text-xs text-secondary">{t('orders.noLineItems')}</p>;
  }
  return (
    <ul className="space-y-2">
      {lines.map((item) => (
        <li key={item.id} className="rounded border border-slate-100 p-2">
          <div className="flex justify-between gap-2">
            <span>
              {item.quantity}× {labelEntity(item, i18n.language)}
              {item.isComped ? ` (${t('orders.comped')})` : ''}
            </span>
            <span>
              {formatMoney(lineItemTotal(item), locale)} {t('pos.currency')}
            </span>
          </div>
          {item.modifiersSnapshot?.length > 0 ? (
            <ul className="mt-1 text-xs text-secondary">
              {item.modifiersSnapshot.map((m, idx) => (
                <li key={idx}>
                  + {labelEntity(m, i18n.language)} ({formatMoney(m.priceDelta ?? 0, locale)})
                </li>
              ))}
            </ul>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function groupKey(group) {
  return group.chequeId ?? `orphan:${group.orders[0]?.id}`;
}

function chequeStatusLabel(status, t) {
  if (status === 'open') return t('cheque.statusOpen');
  if (status === 'paid') return t('cheque.statusPaid');
  return status;
}

function shiftStatusLabel(status, t) {
  if (status === 'open') return t('orders.shiftOpen');
  if (status === 'closed') return t('orders.shiftClosed');
  return t('orders.noShift');
}

export function OrdersPage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const [venues, setVenues] = useState([]);
  const [venueId, setVenueId] = useState(user?.venueId ?? '');
  const [filters, setFilters] = useState(emptyFilters);
  const [page, setPage] = useState(1);
  const [result, setResult] = useState(null);
  const [selectedKey, setSelectedKey] = useState(null);
  const [detail, setDetail] = useState(null);
  const [receipt, setReceipt] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const locale = i18n.language === 'ar' ? 'ar-EG' : 'en-EG';
  const canPickVenue = isHubStaff(user?.role);

  const query = useMemo(() => {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(PAGE_SIZE),
      groupBy: 'shift',
    });
    const scopedVenue = canPickVenue ? venueId : user?.venueId;
    if (scopedVenue) params.set('venueId', scopedVenue);
    if (filters.q.trim()) params.set('q', filters.q.trim());
    if (filters.orderNumber.trim()) params.set('orderNumber', filters.orderNumber.trim());
    if (filters.chequeNumber.trim()) params.set('chequeNumber', filters.chequeNumber.trim());
    if (filters.tableLabel.trim()) params.set('tableLabel', filters.tableLabel.trim());
    if (filters.cashier.trim()) params.set('cashier', filters.cashier.trim());
    if (filters.status) params.set('status', filters.status);
    if (filters.paymentMethod) params.set('paymentMethod', filters.paymentMethod);
    if (filters.from) params.set('from', filters.from);
    if (filters.to) params.set('to', filters.to);
    if (filters.minAmount.trim()) params.set('minAmount', filters.minAmount.trim());
    if (filters.maxAmount.trim()) params.set('maxAmount', filters.maxAmount.trim());
    return params.toString();
  }, [page, filters, venueId, canPickVenue, user?.venueId]);

  const loadList = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [data, venueList] = await Promise.all([
        apiFetch(`/api/v1/manager/orders?${query}`),
        canPickVenue ? apiFetch('/api/v1/venues') : Promise.resolve([]),
      ]);
      setResult(data);
      if (canPickVenue) setVenues(venueList);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setLoading(false);
    }
  }, [query, canPickVenue]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  useEffect(() => {
    if (!selectedKey) {
      setDetail(null);
      setReceipt('');
      return;
    }

    const scopedVenue = canPickVenue ? venueId : user?.venueId;
    const venueQuery = scopedVenue ? `?venueId=${scopedVenue}` : '';

    if (selectedKey.startsWith('orphan:')) {
      const orderId = selectedKey.replace('orphan:', '');
      apiFetch(`/api/v1/manager/orders/${orderId}${venueQuery}`)
        .then(setDetail)
        .catch((err) => setError(friendlyError(err)));
      return;
    }

    apiFetch(`/api/v1/manager/orders/by-cheque/${selectedKey}${venueQuery}`)
      .then(setDetail)
      .catch((err) => setError(friendlyError(err)));
  }, [selectedKey, venueId, canPickVenue, user?.venueId]);

  function updateFilter(key, value) {
    setPage(1);
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  function resetFilters() {
    setPage(1);
    setFilters(emptyFilters);
  }

  function selectGroup(group) {
    setSelectedKey(groupKey(group));
  }

  async function exportCsv() {
    const flatQuery = query
      .replace(/groupBy=shift&?/, '')
      .replace(/&groupBy=shift/, '');
    const blob = await apiFetchBlob(`/api/v1/manager/orders?${flatQuery}&format=csv`);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `orders-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function reprintOrder(orderId) {
    if (!orderId) return;
    const scopedVenue = canPickVenue ? venueId : user?.venueId;
    const venueQuery = scopedVenue ? `?venueId=${scopedVenue}` : '';
    const data = await apiFetch(`/api/v1/manager/orders/${orderId}/receipt${venueQuery}`);
    setReceipt(data.text);
  }

  async function reprintCheque() {
    if (!detail?.cheque?.id) return;
    const scopedVenue = canPickVenue ? venueId : user?.venueId;
    if (!scopedVenue) return;
    const data = await apiFetch(
      `/api/v1/manager/cheques/${detail.cheque.id}/receipt?venueId=${scopedVenue}`,
    );
    setReceipt(data.text);
  }

  const chequeOrders = detail?.chequeOrders ?? (detail?.items ? [detail] : []);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">{t('orders.title')}</h2>
          <p className="text-sm text-secondary">{t('orders.subtitleByShift')}</p>
        </div>
        <button
          type="button"
          onClick={() => exportCsv().catch((e) => setError(friendlyError(e)))}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50"
        >
          {t('orders.exportCsv')}
        </button>
      </div>

      <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 md:grid-cols-2 xl:grid-cols-4">
        <label className="text-sm">
          <span className="mb-1 block text-secondary">{t('orders.search')}</span>
          <input
            className="w-full rounded border px-3 py-2"
            value={filters.q}
            onChange={(e) => updateFilter('q', e.target.value)}
            placeholder={t('orders.searchPlaceholder')}
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-secondary">{t('orders.chequeNumber')}</span>
          <input
            className="w-full rounded border px-3 py-2"
            value={filters.chequeNumber}
            onChange={(e) => updateFilter('chequeNumber', e.target.value)}
            placeholder={t('orders.chequeNumberPlaceholder')}
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-secondary">{t('orders.orderNumber')}</span>
          <input
            className="w-full rounded border px-3 py-2"
            value={filters.orderNumber}
            onChange={(e) => updateFilter('orderNumber', e.target.value)}
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-secondary">{t('orders.table')}</span>
          <input
            className="w-full rounded border px-3 py-2"
            value={filters.tableLabel}
            onChange={(e) => updateFilter('tableLabel', e.target.value)}
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-secondary">{t('orders.cashier')}</span>
          <input
            className="w-full rounded border px-3 py-2"
            value={filters.cashier}
            onChange={(e) => updateFilter('cashier', e.target.value)}
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-secondary">{t('orders.status')}</span>
          <select
            className="w-full rounded border px-3 py-2"
            value={filters.status}
            onChange={(e) => updateFilter('status', e.target.value)}
          >
            <option value="">{t('orders.allStatuses')}</option>
            {ORDER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`orders.status.${s}`, s)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-secondary">{t('orders.paymentMethod')}</span>
          <select
            className="w-full rounded border px-3 py-2"
            value={filters.paymentMethod}
            onChange={(e) => updateFilter('paymentMethod', e.target.value)}
          >
            <option value="">{t('orders.allMethods')}</option>
            <option value="cash">{t('pos.payCash')}</option>
            <option value="card">{t('pos.payCard')}</option>
            <option value="voucher">{t('orders.voucher')}</option>
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-secondary">{t('orders.from')}</span>
          <input
            type="date"
            className="w-full rounded border px-3 py-2"
            value={filters.from}
            onChange={(e) => updateFilter('from', e.target.value)}
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-secondary">{t('orders.to')}</span>
          <input
            type="date"
            className="w-full rounded border px-3 py-2"
            value={filters.to}
            onChange={(e) => updateFilter('to', e.target.value)}
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-secondary">{t('orders.minAmount')}</span>
          <input
            type="number"
            min="0"
            className="w-full rounded border px-3 py-2"
            value={filters.minAmount}
            onChange={(e) => updateFilter('minAmount', e.target.value)}
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-secondary">{t('orders.maxAmount')}</span>
          <input
            type="number"
            min="0"
            className="w-full rounded border px-3 py-2"
            value={filters.maxAmount}
            onChange={(e) => updateFilter('maxAmount', e.target.value)}
          />
        </label>
        {canPickVenue && (
          <label className="text-sm">
            <span className="mb-1 block text-secondary">{t('orders.venue')}</span>
            <select
              className="w-full rounded border px-3 py-2"
              value={venueId}
              onChange={(e) => {
                setPage(1);
                setVenueId(e.target.value);
              }}
            >
              <option value="">{t('orders.allVenues')}</option>
              {venues.map((v) => (
                <option key={v.id} value={v.id}>
                  {labelEntity(v, i18n.language)}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="flex items-end">
          <button
            type="button"
            onClick={resetFilters}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50"
          >
            {t('orders.resetFilters')}
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700">{error}</div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          {loading && !result ? (
            <p className="p-6 text-secondary">{t('common.loading')}</p>
          ) : result?.shifts?.length ? (
            <>
              <div className="divide-y divide-slate-100">
                {result.shifts.map((shift) => (
                  <section key={shift.shiftId ?? 'unassigned'} className="p-4">
                    <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h3 className="font-semibold text-slate-900">
                          {shift.shiftId
                            ? t('orders.shiftSession', {
                                cashier: shift.cashierUsername ?? '—',
                                terminal: shift.terminalName ?? '—',
                              })
                            : t('orders.noShift')}
                        </h3>
                        <p className="text-sm text-secondary">
                          {formatDate(shift.openedAt, locale)}
                          {shift.closedAt
                            ? ` → ${formatDate(shift.closedAt, locale)}`
                            : ` · ${shiftStatusLabel(shift.status, t)}`}
                        </p>
                      </div>
                      <div className="text-sm text-secondary">
                        {t('orders.chequesInShift', {
                          cheques: shift.chequeCount,
                          orders: shift.totalOrders,
                        })}{' '}
                        · {formatMoney(shift.totalSubtotal, locale)} {t('pos.currency')}
                      </div>
                    </div>
                    <div className="overflow-x-auto rounded-lg border border-slate-200">
                      <table className="min-w-full text-sm">
                        <thead className="bg-slate-50 text-start">
                          <tr>
                            <th className="px-3 py-2">{t('orders.chequeNumber')}</th>
                            <th className="px-3 py-2">{t('orders.orderRounds')}</th>
                            <th className="px-3 py-2">{t('orders.table')}</th>
                            <th className="px-3 py-2">{t('orders.chequeStatus')}</th>
                            <th className="px-3 py-2">{t('orders.amount')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(shift.cheques ?? []).map((group) => {
                            const key = groupKey(group);
                            const isSelected = selectedKey === key;
                            return (
                              <tr
                                key={key}
                                className={`cursor-pointer border-t border-slate-100 hover:bg-slate-50 ${
                                  isSelected ? 'bg-blue-50' : ''
                                }`}
                                onClick={() => selectGroup(group)}
                              >
                                <td className="px-3 py-2 font-medium">
                                  <span className="inline-flex flex-wrap items-center gap-1.5">
                                    {group.chequeNumber != null
                                      ? `#${group.chequeNumber}`
                                      : t('orders.noCheque')}
                                    {group.isCrossVenue ? <CrossVenueBadge t={t} /> : null}
                                  </span>
                                </td>
                                <td className="px-3 py-2">
                                  {t('orders.orderRoundsList', {
                                    numbers: (group.orderNumbers ?? []).map((n) => `#${n}`).join(', ') || '—',
                                    count: group.orderCount,
                                  })}
                                </td>
                                <td className="px-3 py-2">{group.tableLabel ?? '—'}</td>
                                <td className="px-3 py-2">
                                  {group.chequeStatus
                                    ? chequeStatusLabel(group.chequeStatus, t)
                                    : (group.orders ?? [])
                                        .map((o) => t(`orders.status.${o.status}`, o.status))
                                        .join(', ')}
                                </td>
                                <td className="px-3 py-2">
                                  {formatMoney(group.totalSubtotal, locale)} {t('pos.currency')}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </section>
                ))}
              </div>
              <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-sm">
                <span className="text-secondary">
                  {t('orders.pageInfoShifts', {
                    page: result.page,
                    totalPages: result.totalPages,
                    total: result.total,
                    cheques: result.totalCheques,
                    orders: result.totalOrders,
                  })}
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="rounded border px-3 py-1 disabled:opacity-40"
                  >
                    {t('orders.prev')}
                  </button>
                  <button
                    type="button"
                    disabled={page >= result.totalPages}
                    onClick={() => setPage((p) => p + 1)}
                    className="rounded border px-3 py-1 disabled:opacity-40"
                  >
                    {t('orders.next')}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <p className="p-6 text-secondary">{t('orders.empty')}</p>
          )}
        </section>

        <aside className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          {!detail ? (
            <p className="text-sm text-secondary">{t('orders.selectCheque')}</p>
          ) : (
            <div className="space-y-4 text-sm">
              <div>
                <h3 className="flex flex-wrap items-center gap-2 text-lg font-semibold">
                  {detail.cheque?.chequeNumber != null
                    ? t('pos.chequeNumber', { number: detail.cheque.chequeNumber })
                    : t('pos.orderNumber', { number: detail.orderNumber })}
                  {detail.cheque?.isCrossVenue ? <CrossVenueBadge t={t} /> : null}
                </h3>
                <p className="text-secondary">
                  {formatDate(detail.openedAt, locale)}
                  {detail.chequeOrders?.length > 1
                    ? ` · ${t('orders.ordersOnCheque', {
                        count: detail.chequeOrders.length,
                        number: detail.cheque?.chequeNumber,
                      })}`
                    : null}
                </p>
              </div>

              {detail.voidAudit ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                  <p className="font-medium text-amber-900">{t('orders.voided')}</p>
                  <p className="mt-1 text-amber-800">{detail.voidAudit.reason}</p>
                </div>
              ) : null}

              {detail.crossVenueGroup ? (
                <CrossVenueGroupPanel
                  group={detail.crossVenueGroup}
                  t={t}
                  language={i18n.language}
                  locale={locale}
                  formatMoney={formatMoney}
                />
              ) : null}

              {detail.cheque ? (
                <div className="space-y-2">
                  {detail.cheque.parentCheque ? (
                    <p className="text-secondary">
                      {t('orders.splitFrom', { number: detail.cheque.parentCheque.chequeNumber })}
                    </p>
                  ) : null}
                  {detail.cheque.childCheques?.length > 0 ? (
                    <ul className="list-inside list-disc text-secondary">
                      {detail.cheque.childCheques.map((c) => (
                        <li key={c.id}>
                          {t('orders.splitChild', {
                            label: c.splitLabel ?? c.chequeNumber,
                            number: c.chequeNumber,
                          })}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {detail.cheque.payments?.length > 0 ? (
                    <div>
                      <p className="font-medium">{t('orders.payments')}</p>
                      <ul className="mt-1 space-y-1">
                        {detail.cheque.payments.map((p) => (
                          <li key={p.id}>
                            {t(`orders.method.${p.method}`, p.method)} —{' '}
                            {formatMoney(p.amount, locale)} {t('pos.currency')}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {detail.totalSubtotal != null ? (
                    <p className="font-medium">
                      {t('orders.chequeTotal')}: {formatMoney(detail.totalSubtotal, locale)}{' '}
                      {t('pos.currency')}
                    </p>
                  ) : null}
                </div>
              ) : null}

              <div>
                <p className="mb-2 font-medium">
                  {chequeOrders.length > 1
                    ? t('orders.ordersOnCheque', {
                        count: chequeOrders.length,
                        number: detail.cheque?.chequeNumber ?? '—',
                      })
                    : t('orders.lineItems')}
                </p>
                <div className="space-y-4">
                  {chequeOrders.map((chequeOrder) => (
                    <div
                      key={chequeOrder.id}
                      className="rounded-lg border border-slate-100 p-3"
                    >
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <span className="font-medium text-slate-900">
                          {t('orders.roundOnCheque', { number: chequeOrder.orderNumber })}
                        </span>
                        <span className="text-xs text-secondary">
                          {t(`orders.status.${chequeOrder.status}`, chequeOrder.status)} ·{' '}
                          {formatMoney(chequeOrder.subtotal, locale)} {t('pos.currency')}
                        </span>
                      </div>
                      {chequeOrder.voidReason || chequeOrder.voidAudit?.reason ? (
                        <p className="mb-2 text-xs text-amber-800">
                          {chequeOrder.voidReason ?? chequeOrder.voidAudit?.reason}
                        </p>
                      ) : null}
                      <OrderLineItems
                        items={chequeOrder.items}
                        t={t}
                        i18n={i18n}
                        locale={locale}
                      />
                      <button
                        type="button"
                        onClick={() => reprintOrder(chequeOrder.id).catch((e) => setError(friendlyError(e)))}
                        className="mt-2 text-xs text-primary-to hover:underline"
                      >
                        {t('orders.reprintOrder')}
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {detail.cheque?.id ? (
                <button
                  type="button"
                  onClick={() => reprintCheque().catch((e) => setError(friendlyError(e)))}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50"
                >
                  {t('orders.reprintCheque')}
                </button>
              ) : null}

              {receipt ? (
                <pre className="max-h-64 overflow-auto rounded border border-slate-200 bg-slate-50 p-3 text-xs whitespace-pre-wrap">
                  {receipt}
                </pre>
              ) : null}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
