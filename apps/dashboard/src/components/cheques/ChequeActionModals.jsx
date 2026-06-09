import { ManagerActionModal } from './ManagerActionModal.jsx';
import { DiscountRequestModal } from './DiscountRequestModal.jsx';
import { ChequeRefundModal } from './ChequeRefundModal.jsx';
import { RequestActionModal } from './RequestActionModal.jsx';

function managerModalCopy(target, t) {
  if (target.type === 'round') {
    return {
      title: t('cheque.voidRoundTitle', { number: target.orderNumber }),
      reasonLabel: t('cheque.voidReason'),
      confirmLabel: t('cheque.confirmVoid'),
      confirmClass: 'bg-red-600 hover:bg-red-700',
    };
  }
  if (target.type === 'cheque') {
    return {
      title: t('cheque.voidChequeTitle', { number: target.chequeNumber }),
      reasonLabel: t('cheque.voidReason'),
      confirmLabel: t('cheque.confirmVoid'),
      confirmClass: 'bg-red-600 hover:bg-red-700',
    };
  }
  return {
    title: t('cheque.compItemTitle', { name: target.itemName }),
    reasonLabel: t('cheque.compReason'),
    confirmLabel: t('cheque.confirmComp'),
    confirmClass: 'bg-amber-600 hover:bg-amber-700',
  };
}

export function ChequeActionModals({
  actionTarget,
  discountForm,
  onClose,
  onSubmit,
  t,
  pinOptional = true,
  error,
  busy,
}) {
  if (!actionTarget) return null;

  if (actionTarget.type === 'discount' || actionTarget.type === 'discount_change') {
    const isChange = actionTarget.type === 'discount_change';
    return (
      <DiscountRequestModal
        chequeNumber={actionTarget.chequeNumber}
        mode={discountForm.mode}
        amount={discountForm.amount}
        percent={discountForm.percent}
        onModeChange={discountForm.setMode}
        onAmountChange={discountForm.setAmount}
        onPercentChange={discountForm.setPercent}
        onConfirm={onSubmit}
        onCancel={onClose}
        t={t}
        titleKey={isChange ? 'cheque.discountChangeTitle' : 'cheque.discountTitle'}
        confirmLabelKey={isChange ? 'cheque.confirmDiscountChange' : 'cheque.applyDiscount'}
        subtitle={
          isChange
            ? t('cheque.discountChangeHint', {
                amount: Number(actionTarget.currentDiscount ?? 0).toFixed(2),
              })
            : undefined
        }
      />
    );
  }

  if (actionTarget.type === 'discount_remove') {
    return (
      <RequestActionModal
        title={t('cheque.discountRemoveTitle', { number: actionTarget.chequeNumber })}
        reasonLabel={t('cheque.discountReason')}
        confirmLabel={t('cheque.confirmDiscountRemove')}
        confirmClass="bg-red-600 hover:bg-red-700"
        subtitle={t('cheque.discountRemoveHint', {
          amount: Number(actionTarget.currentDiscount ?? 0).toFixed(2),
        })}
        t={t}
        onCancel={onClose}
        onConfirm={onSubmit}
      />
    );
  }

  if (actionTarget.type === 'refund' || actionTarget.type === 'force_refund') {
    return (
      <ChequeRefundModal
        cheque={actionTarget.cheque}
        chequeNumber={actionTarget.chequeNumber}
        onConfirm={onSubmit}
        onCancel={onClose}
        t={t}
        error={error}
        submitting={busy}
      />
    );
  }

  const copy = managerModalCopy(actionTarget, t);
  return (
    <ManagerActionModal
      title={copy.title}
      reasonLabel={copy.reasonLabel}
      confirmLabel={copy.confirmLabel}
      confirmClass={copy.confirmClass}
      pinOptional={pinOptional}
      t={t}
      onCancel={onClose}
      onConfirm={onSubmit}
    />
  );
}
