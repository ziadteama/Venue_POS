import { ManagerActionModal } from './ManagerActionModal.jsx';
import { DiscountRequestModal } from './DiscountRequestModal.jsx';
import { RefundRequestModal } from './RefundRequestModal.jsx';
import { ForceRefundModal } from './ForceRefundModal.jsx';

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
  refundForm,
  onClose,
  onSubmit,
  t,
}) {
  if (!actionTarget) return null;

  if (actionTarget.type === 'discount') {
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
      />
    );
  }

  if (actionTarget.type === 'refund') {
    return (
      <RefundRequestModal
        chequeNumber={actionTarget.chequeNumber}
        amount={refundForm.amount}
        method={refundForm.method}
        onAmountChange={refundForm.setAmount}
        onMethodChange={refundForm.setMethod}
        onConfirm={onSubmit}
        onCancel={onClose}
        t={t}
      />
    );
  }

  if (actionTarget.type === 'forceRefund') {
    return (
      <ForceRefundModal
        chequeNumber={actionTarget.chequeNumber}
        amount={refundForm.amount}
        method={refundForm.method}
        onAmountChange={refundForm.setAmount}
        onMethodChange={refundForm.setMethod}
        onConfirm={onSubmit}
        onCancel={onClose}
        t={t}
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
      t={t}
      onCancel={onClose}
      onConfirm={onSubmit}
    />
  );
}
