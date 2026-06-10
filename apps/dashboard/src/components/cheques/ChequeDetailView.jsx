import { Link } from 'react-router-dom';
import { isHubManager } from '@venue-pos/shared';
import { billableOrders } from '../../utils/chequeActions.js';
import { CrossVenueBadge, CrossVenueGroupPanel } from '../CrossVenueBadge.jsx';
import { OpsBreadcrumb } from '../dashboard/OpsBreadcrumb.jsx';
import { Button } from '../ui/Button.jsx';
import { StatusBadge } from '../ui/Badge.jsx';
import { EmptyState } from '../ui/EmptyState.jsx';
import { ChequeIcon } from '../dashboard/icons.jsx';

function formatMoney(value, locale) {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Number(value ?? 0));
}

function ChequeDetailHeader({ detail, shiftId, t }) {
  const breadcrumb = [
    ...(shiftId
      ? [{ label: t('nav.shifts'), to: '/shifts' }]
      : [{ label: t('nav.cheques'), to: '/cheques' }]),
    { label: t('cheque.number', { number: detail.chequeNumber }) },
  ];

  return (
    <div className="mb-4 space-y-3 border-b border-slate-100 pb-4">
      <OpsBreadcrumb items={breadcrumb} />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="flex flex-wrap items-center gap-2 text-lg font-semibold text-slate-900">
            {t('cheque.number', { number: detail.chequeNumber })}
            <StatusBadge
              status={detail.status === 'paid' ? 'paid' : 'open'}
              label={detail.status === 'paid' ? t('cheque.statusPaid') : t('cheque.statusOpen')}
            />
            {detail.isCrossVenue ? <CrossVenueBadge t={t} /> : null}
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            {t('cheque.table', { label: detail.tableLabel })}
            {detail.splitLabel ? ` · ${detail.splitLabel}` : ''}
          </p>
          {detail.parentCheque ? (
            <p className="text-xs text-slate-400">
              {t('cheque.splitFrom', { number: detail.parentCheque.chequeNumber })}
            </p>
          ) : null}
        </div>
        <div className="text-end">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{t('cheque.total')}</p>
          <p className="text-2xl font-bold tabular-nums text-accent-700">
            {detail.total.toFixed(2)} {t('pos.currency')}
          </p>
        </div>
      </div>
    </div>
  );
}

function ChildChequesPanel({ childCheques, t }) {
  if (!childCheques?.length) return null;
  return (
    <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
      <p className="mb-2 font-medium text-slate-700">{t('cheque.childCheques')}</p>
      <ul className="space-y-1">
        {childCheques.map((child) => (
          <li key={child.id} className="flex justify-between text-slate-600">
            <span>
              #{child.chequeNumber} — {child.splitLabel} ({child.status})
            </span>
            <span className="tabular-nums">
              {child.total.toFixed(2)} {t('pos.currency')}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ChequeOrdersSummary({ detail, t }) {
  const orders = billableOrders(detail);
  if (!orders.length) return null;
  const subtotal = orders.reduce((sum, order) => sum + Number(order.subtotal ?? 0), 0);
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-800">
            {t('cheque.ordersSummary', { count: orders.length })}
          </p>
          <p className="text-xs text-slate-500">{t('cheque.ordersManageHint')}</p>
        </div>
        <div className="text-end">
          <p className="text-sm font-semibold tabular-nums text-slate-900">
            {subtotal.toFixed(2)} {t('pos.currency')}
          </p>
          <Link
            to={`/orders?chequeId=${detail.id}`}
            className="text-sm font-medium text-accent-700 hover:underline"
          >
            {t('cheque.viewOrders')} →
          </Link>
        </div>
      </div>
    </div>
  );
}

function ChequeMetaPanels({ detail, isOpenTab, canManage, busy, t, onDiscountAction }) {
  const hasDiscount = (detail.discountAmount ?? 0) > 0;
  const canDiscount = canManage && isOpenTab && !detail.draftOrder?.items?.length;

  return (
    <div className="space-y-3">
      {isOpenTab && detail.draftOrder?.items?.length > 0 ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          {t('cheque.draftPending')}
        </div>
      ) : null}
      {hasDiscount ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>{t('cheque.discountApplied', { amount: detail.discountAmount.toFixed(2) })}</span>
            {canDiscount ? (
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onDiscountAction('discount_change')}
                  className="text-xs font-semibold text-amber-900 hover:underline disabled:opacity-50"
                >
                  {t('cheque.editDiscount')}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onDiscountAction('discount_remove')}
                  className="text-xs font-semibold text-red-700 hover:underline disabled:opacity-50"
                >
                  {t('cheque.removeDiscount')}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
      {detail.isCrossVenue && canDiscount ? (
        <p className="text-xs text-violet-700">{t('crossVenue.discountPercentOnly')}</p>
      ) : null}
      {canDiscount && !hasDiscount && detail.total > 0 ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => onDiscountAction('discount')}
          className="w-full rounded-lg border border-amber-300 py-2 text-sm font-semibold text-amber-800 hover:bg-amber-50 disabled:opacity-50"
        >
          {t('cheque.applyDiscount')}
        </button>
      ) : null}
      {detail.payments?.length > 0 ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
          <p className="mb-1 font-medium text-slate-700">{t('cheque.payments')}</p>
          {detail.payments.map((p) => (
            <div key={p.id} className="flex justify-between text-slate-600">
              <span>{p.method}</span>
              <span className="tabular-nums">
                {p.amount.toFixed(2)} {t('pos.currency')}
              </span>
            </div>
          ))}
        </div>
      ) : null}
      {detail.refunds?.length > 0 ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm">
          <p className="mb-1 font-medium text-red-800">{t('cheque.refunds')}</p>
          {detail.refunds.map((r) => (
            <div key={r.id} className="flex justify-between text-red-700">
              <span>
                {r.method} — {r.reason}
              </span>
              <span className="tabular-nums">
                -{r.amount.toFixed(2)} {t('pos.currency')}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ChequeActionToolbar({
  detail,
  isOpenTab,
  isPaidTab,
  canManage,
  busy,
  t,
  onAction,
  onRefund,
}) {
  if (!canManage) return null;

  const paidTotal = detail.payments?.reduce((s, p) => s + Number(p.amount), 0) ?? 0;
  const refunded = detail.refunds?.reduce((s, r) => s + Number(r.amount), 0) ?? 0;
  const canRefund = isPaidTab && paidTotal - refunded > 0.01;

  if (!isOpenTab && !canRefund) return null;

  return (
    <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
      {canRefund ? (
        <Button variant="secondary" disabled={busy} onClick={() => onRefund(detail)}>
          {t('cheque.processRefund')}
        </Button>
      ) : null}
      {isOpenTab ? (
        <Button
          variant="danger-soft"
          disabled={busy}
          onClick={() =>
            onAction({
              type: 'cheque',
              chequeId: detail.id,
              chequeNumber: detail.chequeNumber,
            })
          }
        >
          {t('cheque.voidCheque')}
        </Button>
      ) : null}
    </div>
  );
}

export function ChequeDetailView({
  detail,
  busy,
  language,
  userRole,
  shiftId,
  t,
  onAction,
  onDiscountAction,
  onRefund,
}) {
  if (!detail) {
    return <EmptyState icon={ChequeIcon} title={t('cheque.selectCheque')} className="py-16" />;
  }

  const isOpenTab = detail.status === 'open';
  const isPaidTab = detail.status === 'paid';
  const canManage = isHubManager(userRole);
  const locale = language === 'ar' ? 'ar-EG' : 'en-EG';

  return (
    <div className="space-y-4">
      <ChequeDetailHeader detail={detail} shiftId={shiftId} t={t} />
      <ChildChequesPanel childCheques={detail.childCheques} t={t} />
      {detail.crossVenueGroup ? (
        <CrossVenueGroupPanel
          group={detail.crossVenueGroup}
          t={t}
          language={language}
          locale={locale}
          formatMoney={formatMoney}
          linkMembers
        />
      ) : null}
      <ChequeOrdersSummary detail={detail} t={t} />
      <ChequeMetaPanels
        detail={detail}
        isOpenTab={isOpenTab}
        canManage={canManage}
        busy={busy}
        t={t}
        onDiscountAction={onDiscountAction}
      />
      <ChequeActionToolbar
        detail={detail}
        isOpenTab={isOpenTab}
        isPaidTab={isPaidTab}
        canManage={canManage}
        busy={busy}
        t={t}
        onAction={onAction}
        onRefund={onRefund}
      />
    </div>
  );
}
