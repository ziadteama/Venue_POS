import { RequestActionModal } from './RequestActionModal.jsx';

const REFUND_METHODS = ['cash', 'card', 'voucher'];

export function ForceRefundModal({
  chequeNumber,
  amount,
  method,
  onAmountChange,
  onMethodChange,
  onConfirm,
  onCancel,
  t,
}) {
  return (
    <RequestActionModal
      title={t('cheque.forceRefundTitle', { number: chequeNumber })}
      reasonLabel={t('cheque.refundReason')}
      confirmLabel={t('cheque.forceRefund')}
      confirmClass="bg-red-600 hover:bg-red-700"
      subtitle={t('cheque.forceRefundHint')}
      t={t}
      onCancel={onCancel}
      onConfirm={({ reason }) =>
        onConfirm({ reason, amount: Number(amount), method })
      }
    >
      <label className="mb-3 block text-sm">
        <span className="mb-1 block text-secondary">{t('cheque.refundAmount')}</span>
        <input
          type="number"
          min="0.01"
          step="0.01"
          value={amount}
          onChange={(e) => onAmountChange(e.target.value)}
          className="w-full rounded border px-3 py-2"
        />
      </label>
      <label className="mb-3 block text-sm">
        <span className="mb-1 block text-secondary">{t('cheque.refundMethod')}</span>
        <select
          value={method}
          onChange={(e) => onMethodChange(e.target.value)}
          className="w-full rounded border px-3 py-2"
        >
          {REFUND_METHODS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </label>
    </RequestActionModal>
  );
}
