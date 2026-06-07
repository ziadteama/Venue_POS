import { ROLES } from '@venue-pos/shared';
import { billableOrders } from '../../utils/chequeActions.js';

function ChequeDetailHeader({ detail, t }) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h3 className="text-lg font-semibold">
          {t('cheque.number', { number: detail.chequeNumber })}
        </h3>
        <p className="text-sm text-secondary">
          {t('cheque.table', { label: detail.tableLabel })}
          {detail.splitLabel ? ` · ${detail.splitLabel}` : ''} ·{' '}
          {detail.status === 'paid' ? t('cheque.statusPaid') : t('cheque.statusOpen')}
        </p>
        {detail.parentCheque && (
          <p className="text-xs text-secondary">
            {t('cheque.splitFrom', { number: detail.parentCheque.chequeNumber })}
          </p>
        )}
      </div>
      <div className="text-end">
        <p className="text-sm text-secondary">{t('cheque.total')}</p>
        <p className="text-2xl font-bold text-primary-to">
          {detail.total.toFixed(2)} {t('pos.currency')}
        </p>
      </div>
    </div>
  );
}

function ChildChequesPanel({ childCheques, t }) {
  if (!childCheques?.length) return null;
  return (
    <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <p className="mb-2 font-medium">{t('cheque.childCheques')}</p>
      <ul className="space-y-1 text-sm">
        {childCheques.map((child) => (
          <li key={child.id} className="flex justify-between text-secondary">
            <span>
              #{child.chequeNumber} — {child.splitLabel} ({child.status})
            </span>
            <span>
              {child.total.toFixed(2)} {t('pos.currency')}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function OrderRoundCard({
  order,
  detail,
  canManage,
  isOpenTab,
  isPaidTab,
  busy,
  language,
  t,
  onComp,
  onVoidRound,
}) {
  const showManage = canManage && (isOpenTab || isPaidTab);
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-medium">
          {t('pos.orderNumber', { number: order.orderNumber })} — {order.status}
        </span>
        <span className="font-semibold">
          {order.subtotal.toFixed(2)} {t('pos.currency')}
        </span>
      </div>
      <ul className="mb-2 space-y-1 text-sm">
        {order.items.map((line) => (
          <li
            key={line.id}
            className={`flex items-center justify-between gap-2 ${
              line.isComped ? 'text-amber-700 line-through' : 'text-secondary'
            }`}
          >
            <span>
              {line.quantity}× {language === 'ar' ? line.nameAr : line.nameEn}
              {line.isComped ? ` (${t('cheque.comped')})` : ''}
            </span>
            {showManage && !line.isComped && (
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  onComp({
                    type: 'comp',
                    chequeId: detail.id,
                    orderId: order.id,
                    itemId: line.id,
                    itemName: language === 'ar' ? line.nameAr : line.nameEn,
                  })
                }
                className="shrink-0 text-xs font-medium text-amber-700 hover:text-amber-800 disabled:opacity-50"
              >
                {t('cheque.compItem')}
              </button>
            )}
          </li>
        ))}
      </ul>
      {showManage && (
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            onVoidRound({
              type: 'round',
              chequeId: detail.id,
              orderId: order.id,
              orderNumber: order.orderNumber,
            })
          }
          className="text-sm font-medium text-red-600 hover:text-red-700 disabled:opacity-50"
        >
          {t('cheque.voidRound')}
        </button>
      )}
    </div>
  );
}

function ChequeMetaPanels({ detail, isOpenTab, canManage, busy, t, onDiscountAction }) {
  const hasDiscount = (detail.discountAmount ?? 0) > 0;
  const canDiscount = canManage && isOpenTab && !detail.draftOrder?.items?.length;

  return (
    <>
      {isOpenTab && detail.draftOrder?.items?.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          {t('cheque.draftPending')}
        </div>
      )}
      {hasDiscount && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>{t('cheque.discountApplied', { amount: detail.discountAmount.toFixed(2) })}</span>
            {canDiscount && (
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
            )}
          </div>
        </div>
      )}
      {canDiscount && !hasDiscount && detail.total > 0 && (
        <button
          type="button"
          disabled={busy}
          onClick={() => onDiscountAction('discount')}
          className="w-full rounded-lg border border-amber-300 py-2 text-sm font-semibold text-amber-800 hover:bg-amber-50 disabled:opacity-50"
        >
          {t('cheque.applyDiscount')}
        </button>
      )}
      {detail.payments?.length > 0 && (
        <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
          <p className="mb-1 font-medium">{t('cheque.payments')}</p>
          {detail.payments.map((p) => (
            <div key={p.id} className="flex justify-between text-secondary">
              <span>{p.method}</span>
              <span>
                {p.amount.toFixed(2)} {t('pos.currency')}
              </span>
            </div>
          ))}
        </div>
      )}
      {detail.refunds?.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm">
          <p className="mb-1 font-medium text-red-800">{t('cheque.refunds')}</p>
          {detail.refunds.map((r) => (
            <div key={r.id} className="flex justify-between text-red-700">
              <span>
                {r.method} — {r.reason}
              </span>
              <span>
                -{r.amount.toFixed(2)} {t('pos.currency')}
              </span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

export function ChequeDetailView({
  detail,
  statusTab,
  busy,
  language,
  userRole,
  t,
  onAction,
  onDiscountAction,
}) {
  if (!detail) {
    return <p className="text-secondary">{t('cheque.selectCheque')}</p>;
  }

  const isOpenTab = statusTab === 'open';
  const isPaidTab = statusTab === 'paid';
  const canManage = userRole === ROLES.VENUE_MANAGER;
  const orders = billableOrders(detail);

  return (
    <>
      <ChequeDetailHeader detail={detail} t={t} />
      <ChildChequesPanel childCheques={detail.childCheques} t={t} />
      <div className="mb-4 space-y-3">
        {orders.map((order) => (
          <OrderRoundCard
            key={order.id}
            order={order}
            detail={detail}
            canManage={canManage}
            isOpenTab={isOpenTab}
            isPaidTab={isPaidTab}
            busy={busy}
            language={language}
            t={t}
            onComp={onAction}
            onVoidRound={onAction}
          />
        ))}
        <ChequeMetaPanels
          detail={detail}
          isOpenTab={isOpenTab}
          canManage={canManage}
          busy={busy}
          t={t}
          onDiscountAction={onDiscountAction}
        />
      </div>
    </>
  );
}
