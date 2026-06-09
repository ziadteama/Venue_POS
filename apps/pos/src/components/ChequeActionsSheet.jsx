import { canSplitByAmount, splittableItems, transferableItems } from '../utils/cheque.js';
import { ModalFrame } from './ModalFrame.jsx';

import { CloseXIcon } from './icons.jsx';

function ActionRow({ icon, label, hint, onClick, danger = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-start transition hover:bg-slate-50 ${
        danger ? 'text-red-700' : 'text-slate-900'
      }`}
    >
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-bold ${
          danger ? 'bg-red-50 text-red-600' : 'bg-slate-100 text-slate-600'
        }`}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{label}</span>
        {hint ? <span className="block text-xs text-secondary">{hint}</span> : null}
      </span>
    </button>
  );
}

export function ChequeActionsSheet({
  cheque,
  order,
  t,
  discountsEnabled,
  refundsEnabled,
  lineTransferEnabled,
  onClose,
  onSplit,
  onSplitAmount,
  onTransfer,
  onDiscount,
  onEditDiscount,
  onRemoveDiscount,
  onRefund,
}) {
  const hasDraft = (order?.items?.length ?? 0) > 0;
  const canBillActions = !cheque?.parentChequeId && !hasDraft;
  const discountAmount = Number(cheque?.discountAmount ?? 0);
  const showSplit = canBillActions && splittableItems(cheque).length >= 2;
  const showSplitAmount = canBillActions && canSplitByAmount(cheque);
  const showTransfer =
    canBillActions && lineTransferEnabled && transferableItems(cheque).length > 0;
  const showDiscountApply =
    discountsEnabled && canBillActions && (cheque?.total ?? 0) > 0 && discountAmount <= 0;
  const showDiscountEdit = discountsEnabled && canBillActions && discountAmount > 0;

  const billActions = [showSplit, showSplitAmount, showTransfer].some(Boolean);
  const adjustActions = showDiscountApply || showDiscountEdit;

  return (
    <ModalFrame layer="base" align="bottom">
      <div className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">{t('pos.actionsTitle')}</h3>
            <p className="text-sm text-secondary">{t('pos.actionsSubtitle')}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-secondary hover:bg-slate-100"
            aria-label={t('common.cancel')}
          >
            <CloseXIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="overflow-y-auto px-3 py-2">
          {billActions ? (
            <section className="mb-2">
              <p className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-secondary">
                {t('pos.actionsBill')}
              </p>
              {showSplit ? (
                <ActionRow icon="/" label={t('pos.splitBill')} onClick={onSplit} />
              ) : null}
              {showSplitAmount ? (
                <ActionRow icon="%" label={t('pos.splitByAmount')} onClick={onSplitAmount} />
              ) : null}
              {showTransfer ? (
                <ActionRow icon="->" label={t('pos.transferLines')} onClick={onTransfer} />
              ) : null}
            </section>
          ) : null}

          {adjustActions ? (
            <section className="mb-2">
              <p className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-secondary">
                {t('pos.actionsAdjustments')}
              </p>
              {showDiscountApply ? (
                <ActionRow icon="%" label={t('pos.applyDiscount')} onClick={onDiscount} />
              ) : null}
              {showDiscountEdit ? (
                <>
                  <ActionRow
                    icon="Ed"
                    label={t('pos.editDiscount')}
                    hint={t('pos.discountCurrent', { amount: discountAmount.toFixed(2) })}
                    onClick={onEditDiscount}
                  />
                  <ActionRow
                    icon="X"
                    label={t('pos.removeDiscount')}
                    onClick={onRemoveDiscount}
                    danger
                  />
                </>
              ) : null}
            </section>
          ) : null}

          {refundsEnabled ? (
            <section>
              <p className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-secondary">
                {t('pos.actionsOther')}
              </p>
              <ActionRow icon="Rf" label={t('pos.refundPaidCheque')} onClick={onRefund} danger />
            </section>
          ) : null}

          {!billActions && !adjustActions && !refundsEnabled ? (
            <p className="px-4 py-6 text-center text-sm text-secondary">{t('pos.actionsEmpty')}</p>
          ) : null}
        </div>
      </div>
    </ModalFrame>
  );
}
