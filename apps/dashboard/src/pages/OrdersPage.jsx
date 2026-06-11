import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ORDER_STATUSES, isHubManager, isHubStaff } from '@venue-pos/shared';
import { apiFetch, apiFetchBlob } from '../api/client.js';
import { friendlyError } from '../utils/apiError.js';
import { useAuth } from '../hooks/useAuth.js';
import { CrossVenueBadge } from '../components/CrossVenueBadge.jsx';
import { ChequeActionModals } from '../components/cheques/ChequeActionModals.jsx';
import { ShiftContextBar } from '../components/cheques/ShiftContextBar.jsx';
import { OpsContextBar } from '../components/dashboard/OpsContextBar.jsx';
import { OrderDetailPanel } from '../components/orders/OrderDetailPanel.jsx';
import { managerActionMethod, managerActionPath } from '../utils/chequeActions.js';
import { PageHeader } from '../components/dashboard/PageHeader.jsx';
import { FilterBar, SearchInput } from '../components/ui/FilterBar.jsx';
import { Field, Input, Select } from '../components/ui/Field.jsx';
import { Button } from '../components/ui/Button.jsx';
import { DataTable } from '../components/ui/DataTable.jsx';
import { StatusBadge } from '../components/ui/Badge.jsx';
import { EmptyState } from '../components/ui/EmptyState.jsx';
import { Drawer } from '../components/ui/Drawer.jsx';
import { TableSkeleton } from '../components/dashboard/Skeleton.jsx';
import { DownloadIcon, OrdersIcon, AlertIcon, ClockIcon } from '../components/dashboard/icons.jsx';

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
    return <p className="text-xs text-slate-500">{t('orders.noLineItems')}</p>;
  }
  return (
    <ul className="space-y-2">
      {lines.map((item) => (
        <li key={item.id} className="rounded-lg border border-slate-100 bg-white p-2.5 text-sm">
          <div className="flex justify-between gap-2">
            <span className="text-slate-700">
              {item.quantity}× {labelEntity(item, i18n.language)}
              {item.isComped ? ` (${t('orders.comped')})` : ''}
            </span>
            <span className="tabular-nums text-slate-700">
              {formatMoney(lineItemTotal(item), locale)} {t('pos.currency')}
            </span>
          </div>
          {item.modifiersSnapshot?.length > 0 ? (
            <ul className="mt-1 text-xs text-slate-500">
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
  const [searchParams, setSearchParams] = useSearchParams();
  const deepChequeId = searchParams.get('chequeId');
  const deepShiftId = searchParams.get('shiftId');
  const deepVenueId = searchParams.get('venueId');
  const [venues, setVenues] = useState([]);
  const [venueId, setVenueId] = useState(deepVenueId || user?.venueId || '');

  useEffect(() => {
    if (deepVenueId) setVenueId(deepVenueId);
  }, [deepVenueId]);
  const [filters, setFilters] = useState(emptyFilters);
  const [page, setPage] = useState(1);
  const [result, setResult] = useState(null);
  const [selectedKey, setSelectedKey] = useState(null);
  const [detail, setDetail] = useState(null);
  const [receipt, setReceipt] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [actionTarget, setActionTarget] = useState(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [chequeContext, setChequeContext] = useState(null);
  const [shiftContext, setShiftContext] = useState(null);

  const locale = i18n.language === 'ar' ? 'ar-EG' : 'en-EG';
  const canPickVenue = isHubStaff(user?.role);
  const canManageOrders = isHubManager(user?.role);
  const scopedVenue = canPickVenue ? venueId : user?.venueId;

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
    if (deepChequeId) params.set('chequeId', deepChequeId);
    return params.toString();
  }, [page, filters, venueId, canPickVenue, user?.venueId, deepChequeId]);

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
    if (deepVenueId && canPickVenue) {
      setVenueId(deepVenueId);
    }
  }, [deepVenueId, canPickVenue]);

  useEffect(() => {
    if (!deepChequeId) return;
    setSelectedKey(deepChequeId);
    setFilters((prev) => {
      if (!prev.tableLabel && !prev.chequeNumber) return prev;
      return { ...prev, tableLabel: '', chequeNumber: '' };
    });
  }, [deepChequeId]);

  useEffect(() => {
    if (!deepShiftId || !result?.shifts?.length) return;
    const el = document.getElementById(`shift-${deepShiftId}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [deepShiftId, result]);

  useEffect(() => {
    if (!deepChequeId) {
      setChequeContext(null);
      return;
    }
    const vId = deepVenueId || scopedVenue;
    if (!vId) return;
    apiFetch(`/api/v1/manager/cheques/${deepChequeId}?venueId=${vId}`)
      .then(setChequeContext)
      .catch(() => setChequeContext(null));
  }, [deepChequeId, deepVenueId, scopedVenue]);

  useEffect(() => {
    if (!deepShiftId) {
      setShiftContext(null);
      return;
    }
    const vId = deepVenueId || scopedVenue;
    if (!vId) return;
    apiFetch(`/api/v1/manager/shifts/${deepShiftId}?venueId=${vId}`)
      .then(setShiftContext)
      .catch(() => setShiftContext(null));
  }, [deepShiftId, deepVenueId, scopedVenue]);

  useEffect(() => {
    if (!selectedKey) {
      setDetail(null);
      setReceipt('');
      return;
    }

    const detailVenue = deepVenueId || scopedVenue;
    const venueQuery = detailVenue ? `?venueId=${detailVenue}` : '';

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
  }, [selectedKey, venueId, deepVenueId, scopedVenue, canPickVenue, user?.venueId]);

  function updateFilter(key, value) {
    setPage(1);
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  function resetFilters() {
    setPage(1);
    setFilters(emptyFilters);
  }

  function syncSelectionUrl(group) {
    const next = new URLSearchParams(searchParams);
    if (group?.chequeId) {
      next.set('chequeId', group.chequeId);
      if (group.venueId) next.set('venueId', group.venueId);
    } else {
      next.delete('chequeId');
    }
    setSearchParams(next, { replace: true });
  }

  function selectGroup(group) {
    setSelectedKey(groupKey(group));
    syncSelectionUrl(group);
  }

  function clearChequeFilter() {
    setSelectedKey(null);
    setDetail(null);
    setReceipt('');
    const next = new URLSearchParams(searchParams);
    next.delete('chequeId');
    setSearchParams(next, { replace: true });
  }

  function clearMobileSelection() {
    clearChequeFilter();
  }

  function clearShiftFilter() {
    const next = new URLSearchParams(searchParams);
    next.delete('shiftId');
    setSearchParams(next, { replace: true });
  }

  async function exportCsv() {
    const flatQuery = query.replace(/groupBy=shift&?/, '').replace(/&groupBy=shift/, '');
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

  async function reloadDetail() {
    if (!selectedKey) return;
    const detailVenue = deepVenueId || scopedVenue;
    const venueQuery = detailVenue ? `?venueId=${detailVenue}` : '';
    if (selectedKey.startsWith('orphan:')) {
      const orderId = selectedKey.replace('orphan:', '');
      setDetail(await apiFetch(`/api/v1/manager/orders/${orderId}${venueQuery}`));
      return;
    }
    setDetail(await apiFetch(`/api/v1/manager/orders/by-cheque/${selectedKey}${venueQuery}`));
  }

  async function runOrderAction(body) {
    const target = actionTarget;
    const path = managerActionPath(target);
    if (!path) return;
    const actionVenue = detail?.venueId || deepVenueId || (canPickVenue ? venueId : user?.venueId);
    setActionBusy(true);
    setError('');
    try {
      const q = actionVenue ? `?venueId=${actionVenue}` : '';
      await apiFetch(`${path}${q}`, {
        method: managerActionMethod(target),
        body: JSON.stringify(body),
      });
      setActionTarget(null);
      await reloadDetail();
      await loadList();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setActionBusy(false);
    }
  }

  const chequeOrders = detail?.chequeOrders ?? (detail?.items ? [detail] : []);
  const chequeStatus = detail?.cheque?.status;
  const showOrderActions =
    canManageOrders && (chequeStatus === 'open' || chequeStatus === 'paid');

  const orderDetailPanelProps = {
    detail,
    chequeOrders,
    receipt,
    locale,
    venueId: scopedVenue,
    t,
    i18n,
    showOrderActions,
    actionBusy,
    onReprintCheque: () => reprintCheque().catch((e) => setError(friendlyError(e))),
    onReprintOrder: (orderId) => reprintOrder(orderId).catch((e) => setError(friendlyError(e))),
    onCompItem: (target) => setActionTarget({ type: 'comp', ...target }),
    onVoidRound: (target) => setActionTarget({ type: 'round', ...target }),
    OrderLineItems,
  };

  const mobileDrawerTitle =
    detail?.cheque?.chequeNumber != null
      ? t('pos.chequeNumber', { number: detail.cheque.chequeNumber })
      : detail?.orderNumber != null
        ? t('pos.orderNumber', { number: detail.orderNumber })
        : t('orders.title');

  const chequeColumns = [
    {
      key: 'chequeNumber',
      header: t('orders.chequeNumber'),
      render: (group) =>
        group.chequeId && group.chequeNumber != null ? (
          <span className="inline-flex flex-wrap items-center gap-1.5">
            <Link
              to={`/cheques?chequeId=${group.chequeId}&venueId=${group.venueId}`}
              onClick={(e) => e.stopPropagation()}
              className="font-medium text-accent-700 hover:underline"
            >
              #{group.chequeNumber}
            </Link>
            {group.isCrossVenue ? <CrossVenueBadge t={t} /> : null}
          </span>
        ) : (
          <span className="font-medium text-slate-900">{t('orders.noCheque')}</span>
        ),
    },
    {
      key: 'rounds',
      header: t('orders.orderRounds'),
      render: (group) =>
        t('orders.orderRoundsList', {
          numbers: (group.orderNumbers ?? []).map((n) => `#${n}`).join(', ') || '—',
          count: group.orderCount,
        }),
    },
    {
      key: 'table',
      header: t('orders.table'),
      render: (group) =>
        group.serviceMode === 'takeaway' ? t('orders.takeAway') : group.tableLabel ?? '—',
    },
    {
      key: 'status',
      header: t('orders.chequeStatus'),
      render: (group) =>
        group.chequeStatus ? (
          <StatusBadge
            status={group.chequeStatus}
            label={chequeStatusLabel(group.chequeStatus, t)}
          />
        ) : (
          <span className="text-slate-500">
            {(group.orders ?? []).map((o) => t(`orders.status.${o.status}`, o.status)).join(', ')}
          </span>
        ),
    },
    {
      key: 'amount',
      header: t('orders.amount'),
      numeric: true,
      render: (group) => (
        <span className="font-semibold text-slate-900">
          {formatMoney(group.totalSubtotal, locale)} {t('pos.currency')}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('orders.title')}
        subtitle={t('orders.subtitleByShift')}
        actions={
          <Button
            variant="secondary"
            onClick={() => exportCsv().catch((e) => setError(friendlyError(e)))}
          >
            <DownloadIcon className="h-4 w-4" />
            {t('orders.exportCsv')}
          </Button>
        }
      />

      <FilterBar
        onReset={resetFilters}
        resetLabel={t('orders.resetFilters')}
        moreLabel={t('common.moreFilters')}
        primary={
          <>
            <SearchInput
              value={filters.q}
              onChange={(v) => updateFilter('q', v)}
              placeholder={t('orders.searchPlaceholder')}
              className="sm:col-span-2 lg:w-64"
            />
            <Select
              className="py-2"
              value={filters.status}
              onChange={(e) => updateFilter('status', e.target.value)}
            >
              <option value="">{t('orders.allStatuses')}</option>
              {ORDER_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {t(`orders.status.${s}`, s)}
                </option>
              ))}
            </Select>
            <Select
              className="py-2"
              value={filters.paymentMethod}
              onChange={(e) => updateFilter('paymentMethod', e.target.value)}
            >
              <option value="">{t('orders.allMethods')}</option>
              <option value="cash">{t('pos.payCash')}</option>
              <option value="card">{t('pos.payCard')}</option>
              <option value="voucher">{t('orders.voucher')}</option>
            </Select>
            {canPickVenue ? (
              <Select
                className="py-2"
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
              </Select>
            ) : null}
          </>
        }
        advanced={
          <>
            <Field label={t('orders.chequeNumber')}>
              <Input
                value={filters.chequeNumber}
                onChange={(e) => updateFilter('chequeNumber', e.target.value)}
                placeholder={t('orders.chequeNumberPlaceholder')}
              />
            </Field>
            <Field label={t('orders.orderNumber')}>
              <Input
                value={filters.orderNumber}
                onChange={(e) => updateFilter('orderNumber', e.target.value)}
              />
            </Field>
            <Field label={t('orders.table')}>
              <Input
                value={filters.tableLabel}
                onChange={(e) => updateFilter('tableLabel', e.target.value)}
              />
            </Field>
            <Field label={t('orders.cashier')}>
              <Input value={filters.cashier} onChange={(e) => updateFilter('cashier', e.target.value)} />
            </Field>
            <Field label={t('orders.from')}>
              <Input type="date" value={filters.from} onChange={(e) => updateFilter('from', e.target.value)} />
            </Field>
            <Field label={t('orders.to')}>
              <Input type="date" value={filters.to} onChange={(e) => updateFilter('to', e.target.value)} />
            </Field>
            <Field label={t('orders.minAmount')}>
              <Input
                type="number"
                min="0"
                value={filters.minAmount}
                onChange={(e) => updateFilter('minAmount', e.target.value)}
              />
            </Field>
            <Field label={t('orders.maxAmount')}>
              <Input
                type="number"
                min="0"
                value={filters.maxAmount}
                onChange={(e) => updateFilter('maxAmount', e.target.value)}
              />
            </Field>
          </>
        }
      />

      {error ? (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          <AlertIcon className="h-5 w-5 shrink-0" />
          {error}
        </div>
      ) : null}

      <ChequeActionModals
        actionTarget={actionTarget}
        discountForm={{
          mode: 'amount',
          amount: '',
          percent: '',
          setMode: () => {},
          setAmount: () => {},
          setPercent: () => {},
        }}
        onClose={() => setActionTarget(null)}
        onSubmit={runOrderAction}
        t={t}
        error={error}
        busy={actionBusy}
      />

      {deepChequeId && chequeContext ? (
        <OpsContextBar
          breadcrumb={[
            { label: t('nav.cheques'), to: '/cheques' },
            {
              label: t('cheque.number', { number: chequeContext.chequeNumber }),
              to: `/cheques?chequeId=${chequeContext.id}&venueId=${chequeContext.venueId}`,
            },
            { label: t('nav.orders') },
          ]}
          hint={t('orders.chequeContextHint', {
            table: chequeContext.tableLabel,
            status: chequeContext.status === 'paid' ? t('cheque.statusPaid') : t('cheque.statusOpen'),
          })}
          backTo={`/cheques?chequeId=${chequeContext.id}&venueId=${chequeContext.venueId}`}
          backLabel={t('orders.backToCheque')}
          onClear={clearChequeFilter}
          clearLabel={t('orders.clearChequeFilter')}
        />
      ) : null}

      {deepShiftId && !deepChequeId ? (
        <ShiftContextBar
          shiftContext={shiftContext}
          shiftId={deepShiftId}
          chequeCount={
            result?.shifts?.find((s) => s.shiftId === deepShiftId)?.chequeCount ?? 0
          }
          t={t}
          onClear={clearShiftFilter}
          hintKey="orders.shiftFilterHint"
        />
      ) : null}

      {loading && !result && !deepChequeId ? (
        <TableSkeleton rows={8} cols={5} />
      ) : result?.shifts?.length || deepChequeId ? (
        <div className="grid gap-4 xl:grid-cols-[1fr_min(22rem,38%)]">
          <div className="min-w-0 space-y-5">
            {result?.shifts?.length ? null : deepChequeId ? (
              <div className="surface-card px-5 py-4 text-sm text-slate-600">
                {t('orders.chequeNotInListHint')}
              </div>
            ) : null}
            {(result?.shifts ?? []).map((shift) => (
              <section
                key={shift.shiftId ?? 'unassigned'}
                id={shift.shiftId ? `shift-${shift.shiftId}` : undefined}
                className={`surface-card overflow-hidden ${
                  deepShiftId && shift.shiftId === deepShiftId ? 'ring-2 ring-accent-500' : ''
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                      <ClockIcon className="h-4 w-4" />
                    </span>
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900">
                        {shift.shiftId
                          ? t('orders.shiftSession', {
                              cashier: shift.cashierUsername ?? '—',
                              terminal: shift.terminalName ?? '—',
                            })
                          : t('orders.noShift')}
                      </h3>
                      <p className="text-xs text-slate-500">
                        {formatDate(shift.openedAt, locale)}
                        {shift.closedAt
                          ? ` → ${formatDate(shift.closedAt, locale)}`
                          : ` · ${shiftStatusLabel(shift.status, t)}`}
                      </p>
                    </div>
                  </div>
                  <div className="w-full text-xs text-slate-500 sm:w-auto sm:text-end">
                    {t('orders.chequesInShift', {
                      cheques: shift.chequeCount,
                      orders: shift.totalOrders,
                    })}
                    <div className="mt-0.5 text-sm font-semibold tabular-nums text-slate-900">
                      {formatMoney(shift.totalSubtotal, locale)} {t('pos.currency')}
                    </div>
                    {shift.shiftId && scopedVenue ? (
                      <Link
                        to={`/cheques?shiftId=${shift.shiftId}&venueId=${scopedVenue}`}
                        className="mt-1 inline-block text-xs font-medium text-accent-700 hover:underline"
                      >
                        {t('orders.viewShiftCheques')}
                      </Link>
                    ) : null}
                  </div>
                </div>
                <DataTable
                  columns={chequeColumns}
                  rows={shift.cheques ?? []}
                  rowKey={(group) => groupKey(group)}
                  onRowClick={selectGroup}
                  isRowActive={(group) => selectedKey === groupKey(group)}
                />
              </section>
            ))}

            {result?.shifts?.length ? (
              <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                <span className="text-slate-500">
                  {t('orders.pageInfoShifts', {
                    page: result.page,
                    totalPages: result.totalPages,
                    total: result.total,
                    cheques: result.totalCheques,
                    orders: result.totalOrders,
                  })}
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    {t('orders.prev')}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={page >= result.totalPages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    {t('orders.next')}
                  </Button>
                </div>
              </div>
            ) : null}
          </div>

          <aside className="hidden surface-card p-5 xl:block xl:sticky xl:top-24 xl:max-h-[calc(100vh-7rem)] xl:overflow-y-auto">
            <OrderDetailPanel {...orderDetailPanelProps} />
          </aside>
        </div>
      ) : (
        <div className="surface-card">
          <EmptyState icon={OrdersIcon} title={t('orders.empty')} className="py-16" />
        </div>
      )}

      {selectedKey && detail ? (
        <div className="xl:hidden">
          <Drawer
            open
            onClose={clearMobileSelection}
            icon={OrdersIcon}
            title={mobileDrawerTitle}
            size="2xl"
          >
            <OrderDetailPanel {...orderDetailPanelProps} />
          </Drawer>
        </div>
      ) : null}

    </div>
  );
}
