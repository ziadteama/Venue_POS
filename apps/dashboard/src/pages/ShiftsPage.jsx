import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { isHubStaff, canSeeFinancials } from '@venue-pos/shared';
import { apiFetch, apiFetchBlob } from '../api/client.js';
import { friendlyError } from '../utils/apiError.js';
import { useAuth } from '../hooks/useAuth.js';
import { PageHeader } from '../components/dashboard/PageHeader.jsx';
import { StatCard } from '../components/dashboard/StatCard.jsx';
import { SectionCard } from '../components/ui/Card.jsx';
import { FilterBar, SearchInput } from '../components/ui/FilterBar.jsx';
import { Field, Input, Select } from '../components/ui/Field.jsx';
import { Button } from '../components/ui/Button.jsx';
import { DataTable } from '../components/ui/DataTable.jsx';
import { Drawer } from '../components/ui/Drawer.jsx';
import { Modal } from '../components/ui/Modal.jsx';
import { StatusBadge } from '../components/ui/Badge.jsx';
import { EmptyState } from '../components/ui/EmptyState.jsx';
import { TableSkeleton } from '../components/dashboard/Skeleton.jsx';
import {
  DownloadIcon,
  ShiftIcon,
  RevenueIcon,
  PowerIcon,
  AlertIcon,
} from '../components/dashboard/icons.jsx';

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
      <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400">{title}</h4>
      <dl className="mt-2 grid gap-1 text-sm sm:grid-cols-3">
        {['cash', 'card', 'voucher'].map((method) => (
          <div key={method}>
            <dt className="text-xs text-slate-500">{t(`orders.method.${method}`)}</dt>
            <dd className="font-medium tabular-nums text-slate-800">
              {formatMoney(methods?.[method] ?? 0, locale)} {t('pos.currency')}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function DetailRow({ label, children }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="font-medium tabular-nums text-slate-800">{children}</dd>
    </div>
  );
}

function ForceCloseModal({ shift, t, locale, onClose, onSuccess, setError }) {
  const [closeFloat, setCloseFloat] = useState('');
  const [managerPin, setManagerPin] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState('');

  async function submit(e) {
    e.preventDefault();
    setSubmitting(true);
    setLocalError('');
    setError('');
    try {
      await apiFetch(`/api/v1/manager/shifts/${shift.id}/force-close`, {
        method: 'POST',
        body: JSON.stringify({ closeFloat: Number(closeFloat), managerPin }),
      });
      onSuccess();
      onClose();
    } catch (err) {
      setLocalError(friendlyError(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      onClose={submitting ? undefined : onClose}
      title={t('shifts.forceCloseTitle')}
      subtitle={t('shifts.forceCloseHint', {
        cashier: shift.cashierUsername,
        expected: formatMoney(shift.expectedCash, locale),
      })}
      error={localError}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="force-close-form" variant="danger" loading={submitting}>
            {t('shifts.forceClose')}
          </Button>
        </>
      }
    >
      <form id="force-close-form" onSubmit={submit} className="space-y-3">
        <Field label={t('shifts.closeFloat')}>
          <Input
            type="number"
            min="0"
            step="0.01"
            required
            value={closeFloat}
            onChange={(e) => setCloseFloat(e.target.value)}
          />
        </Field>
        <Field label={t('shifts.managerPin')}>
          <Input
            type="password"
            inputMode="numeric"
            required
            value={managerPin}
            onChange={(e) => setManagerPin(e.target.value)}
          />
        </Field>
      </form>
    </Modal>
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
  const [eodDate, setEodDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [eod, setEod] = useState(null);

  const locale = i18n.language === 'ar' ? 'ar-EG' : 'en-EG';
  const currencyLabel = t('pos.currency');
  const canPickVenue = isHubStaff(user?.role);
  const showFinancials = canSeeFinancials(user);

  const query = useMemo(() => {
    const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
    const scopedVenue = canPickVenue ? venueId : user?.venueId;
    if (scopedVenue) params.set('venueId', scopedVenue);
    if (filters.status) params.set('status', filters.status);
    if (filters.cashier.trim()) params.set('cashier', filters.cashier.trim());
    if (filters.from) params.set('from', filters.from);
    if (filters.to) params.set('to', filters.to);
    return params.toString();
  }, [page, filters, canPickVenue, venueId, user?.venueId]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [data, venueList] = await Promise.all([
        apiFetch(`/api/v1/manager/shifts?${query}`),
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
    load();
  }, [load]);

  useEffect(() => {
    if (!showFinancials) {
      setEod(null);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        const params = new URLSearchParams({ date: eodDate });
        const scopedVenue = canPickVenue ? venueId : user?.venueId;
        if (scopedVenue) params.set('venueId', scopedVenue);
        const data = await apiFetch(`/api/v1/manager/shifts/eod?${params}`);
        if (!cancelled) setEod(data);
      } catch {
        if (!cancelled) setEod(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [eodDate, canPickVenue, venueId, user?.venueId, showFinancials]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const scopedVenue = canPickVenue ? venueId : user?.venueId;
        const qs = scopedVenue ? `?venueId=${scopedVenue}` : '';
        const data = await apiFetch(`/api/v1/manager/shifts/${selectedId}${qs}`);
        if (!cancelled) setDetail(data);
      } catch (err) {
        if (!cancelled) setError(friendlyError(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedId, canPickVenue, venueId, user?.venueId]);

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
    const blob = await apiFetchBlob(`/api/v1/manager/shifts?${query}&format=csv`);
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

  const columns = [
    {
      key: 'cashier',
      header: t('shifts.cashier'),
      render: (row) => <span className="font-medium text-slate-900">{row.cashierUsername}</span>,
    },
    ...(canPickVenue
      ? [{ key: 'venue', header: t('shifts.venue'), render: (row) => labelVenue(row, i18n.language) }]
      : []),
    { key: 'terminal', header: t('shifts.terminal'), render: (row) => row.terminalName },
    {
      key: 'status',
      header: t('shifts.status'),
      render: (row) => (
        <StatusBadge
          status={row.status === 'open' ? 'open' : 'closed'}
          label={row.status === 'open' ? t('shifts.statusOpen') : t('shifts.statusClosed')}
        />
      ),
    },
    {
      key: 'openFloat',
      header: t('shifts.openFloat'),
      numeric: true,
      render: (row) => `${formatMoney(row.openFloat, locale)} ${currencyLabel}`,
    },
    {
      key: 'expected',
      header: t('shifts.expected'),
      numeric: true,
      render: (row) => `${formatMoney(row.expectedCash, locale)} ${currencyLabel}`,
    },
    {
      key: 'overShort',
      header: t('shifts.overShort'),
      numeric: true,
      render: (row) => (
        <span className={`font-medium ${overShortClass(row.overShortAmount)}`}>
          {row.overShortAmount != null
            ? `${formatMoney(row.overShortAmount, locale)} ${currencyLabel}`
            : '—'}
        </span>
      ),
    },
    {
      key: 'openedAt',
      header: t('shifts.openedAt'),
      render: (row) => <span className="text-slate-500">{formatDate(row.openedAt, locale)}</span>,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('shifts.title')}
        subtitle={t('shifts.subtitle')}
        actions={
          showFinancials ? (
            <Button variant="secondary" onClick={() => exportCsv().catch((e) => setError(friendlyError(e)))}>
              <DownloadIcon className="h-4 w-4" />
              {t('shifts.exportCsv')}
            </Button>
          ) : null
        }
      />

      {showFinancials ? (
        <SectionCard
          title={t('shifts.eodTitle')}
          hint={t('shifts.eodSubtitle')}
          action={
            <Input
              type="date"
              className="w-auto py-2"
              value={eodDate}
              onChange={(e) => setEodDate(e.target.value)}
            />
          }
        >
          {eod ? (
            <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-400">
                  {t('shifts.eodNetRevenue')}
                </dt>
                <dd className="text-xl font-bold tabular-nums text-accent-700">
                  {formatMoney(eod.netRevenue, locale)} {currencyLabel}
                </dd>
              </div>
              <DetailRow label={t('shifts.totalRevenue')}>{formatMoney(eod.totalRevenue, locale)}</DetailRow>
              <DetailRow label={t('shifts.refundCount')}>
                {formatMoney(eod.totalRefunds, locale)} ({eod.refundCount})
              </DetailRow>
              <DetailRow label={t('shifts.discountCount')}>
                {formatMoney(eod.discountTotal, locale)} ({eod.discountCount})
              </DetailRow>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-400">
                  {t('shifts.pageOverShort')}
                </dt>
                <dd className={`text-lg font-semibold tabular-nums ${overShortClass(eod.totalOverShort)}`}>
                  {formatMoney(eod.totalOverShort, locale)}
                </dd>
              </div>
            </dl>
          ) : (
            <p className="text-sm text-slate-500">{t('analytics.noData')}</p>
          )}
        </SectionCard>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-3">
        <StatCard label={t('shifts.openCount')} value={summary.open} icon={ShiftIcon} tone="amber" />
        <StatCard label={t('shifts.closedCount')} value={summary.closed} icon={PowerIcon} tone="blue" />
        <StatCard
          label={t('shifts.pageOverShort')}
          value={`${formatMoney(summary.totalOverShort, locale)} ${currencyLabel}`}
          icon={RevenueIcon}
          tone={summary.totalOverShort < 0 ? 'amber' : 'emerald'}
        />
      </section>

      <FilterBar
        onReset={resetFilters}
        resetLabel={t('shifts.resetFilters')}
        primary={
          <>
            <SearchInput
              value={filters.cashier}
              onChange={(v) => {
                setFilters((f) => ({ ...f, cashier: v }));
                setPage(1);
              }}
              placeholder={t('shifts.cashierPlaceholder')}
              className="w-full sm:w-56"
            />
            <Select
              className="w-auto py-2"
              value={filters.status}
              onChange={(e) => {
                setFilters((f) => ({ ...f, status: e.target.value }));
                setPage(1);
              }}
            >
              <option value="">{t('shifts.allStatuses')}</option>
              <option value="open">{t('shifts.statusOpen')}</option>
              <option value="closed">{t('shifts.statusClosed')}</option>
            </Select>
            {canPickVenue && venues.length > 0 ? (
              <Select
                className="w-auto py-2"
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
              </Select>
            ) : null}
            <Input
              type="date"
              className="w-auto py-2"
              value={filters.from}
              onChange={(e) => {
                setFilters((f) => ({ ...f, from: e.target.value }));
                setPage(1);
              }}
            />
            <Input
              type="date"
              className="w-auto py-2"
              value={filters.to}
              onChange={(e) => {
                setFilters((f) => ({ ...f, to: e.target.value }));
                setPage(1);
              }}
            />
          </>
        }
      />

      {error ? (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          <AlertIcon className="h-5 w-5 shrink-0" />
          {error}
        </div>
      ) : null}

      {loading && !result ? (
        <TableSkeleton rows={8} cols={canPickVenue ? 8 : 7} />
      ) : !result?.shifts?.length ? (
        <div className="surface-card">
          <EmptyState icon={ShiftIcon} title={t('shifts.empty')} className="py-16" />
        </div>
      ) : (
        <>
          <div className="surface-card overflow-hidden">
            <DataTable
              columns={columns}
              rows={result.shifts}
              rowKey={(row) => row.id}
              onRowClick={(row) => setSelectedId(row.id)}
              isRowActive={(row) => selectedId === row.id}
            />
          </div>
          {result.totalPages > 1 ? (
            <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm">
              <p className="text-slate-500">
                {t('shifts.pageInfo', {
                  page: result.page,
                  totalPages: result.totalPages,
                  total: result.total,
                })}
              </p>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  {t('shifts.prev')}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page >= result.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  {t('shifts.next')}
                </Button>
              </div>
            </div>
          ) : null}
        </>
      )}

      <Drawer
        open={Boolean(selectedId)}
        onClose={() => setSelectedId(null)}
        size="lg"
        icon={ShiftIcon}
        title={detail?.cashierUsername ?? t('shifts.selectShift')}
        subtitle={
          detail
            ? `${detail.terminalName}${canPickVenue ? ` · ${labelVenue(detail, i18n.language)}` : ''}`
            : undefined
        }
        footer={
          detail?.status === 'open' ? (
            <Button variant="danger" onClick={() => setForceCloseShift(detail)}>
              {t('shifts.forceClose')}
            </Button>
          ) : null
        }
      >
        {!detail ? (
          <p className="text-sm text-slate-500">{t('common.loading')}</p>
        ) : (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <StatusBadge
                status={detail.status === 'open' ? 'open' : 'closed'}
                label={detail.status === 'open' ? t('shifts.statusOpen') : t('shifts.statusClosed')}
              />
            </div>
            <dl className="grid gap-4 text-sm sm:grid-cols-2">
              <DetailRow label={t('shifts.openFloat')}>
                {formatMoney(detail.openFloat, locale)} {currencyLabel}
              </DetailRow>
              <DetailRow label={t('shifts.expected')}>
                {formatMoney(detail.expectedCash, locale)} {currencyLabel}
              </DetailRow>
              <DetailRow label={t('shifts.closeFloat')}>
                {detail.closeFloat != null
                  ? `${formatMoney(detail.closeFloat, locale)} ${currencyLabel}`
                  : '—'}
              </DetailRow>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-400">{t('shifts.overShort')}</dt>
                <dd className={`font-medium tabular-nums ${overShortClass(detail.overShortAmount)}`}>
                  {detail.overShortAmount != null
                    ? `${formatMoney(detail.overShortAmount, locale)} ${currencyLabel}`
                    : '—'}
                </dd>
              </div>
              <DetailRow label={t('shifts.totalRevenue')}>
                {showFinancials && detail.totalRevenue != null
                  ? `${formatMoney(detail.totalRevenue, locale)} ${currencyLabel}`
                  : '—'}
              </DetailRow>
              <DetailRow label={t('shifts.openedAt')}>{formatDate(detail.openedAt, locale)}</DetailRow>
              <DetailRow label={t('shifts.closedAt')}>{formatDate(detail.closedAt, locale)}</DetailRow>
              <DetailRow label={t('shifts.paymentCount')}>{detail.paymentCount}</DetailRow>
              <DetailRow label={t('shifts.refundCount')}>{detail.refundCount}</DetailRow>
              <DetailRow label={t('shifts.discountCount')}>
                {showFinancials
                  ? `${formatMoney(detail.discountTotal, locale)} (${detail.discountCount})`
                  : detail.discountCount}
              </DetailRow>
            </dl>

            <Link
              to={`/cheques?shiftId=${detail.id}&venueId=${detail.venueId}`}
              className="inline-flex items-center text-sm font-medium text-accent-700 hover:underline"
            >
              {t('shifts.viewCheques')}
            </Link>

            {showFinancials ? (
              <div className="rounded-xl border border-slate-100 bg-surface-overlay p-3">
                <MethodBreakdown
                  title={t('shifts.paymentsByMethod')}
                  methods={detail.paymentsByMethod}
                  t={t}
                  locale={locale}
                />
              </div>
            ) : null}
            {showFinancials && detail.refundCount > 0 ? (
              <div className="rounded-xl border border-red-100 bg-red-50/60 p-3">
                <MethodBreakdown
                  title={t('shifts.refundsByMethod')}
                  methods={detail.refundsByMethod}
                  t={t}
                  locale={locale}
                />
              </div>
            ) : null}
          </div>
        )}
      </Drawer>

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
