import { RequestActionModal } from './RequestActionModal.jsx';

export function DiscountRequestModal({
  chequeNumber,
  mode,
  amount,
  percent,
  percentOnly = false,
  onModeChange,
  onAmountChange,
  onPercentChange,
  onConfirm,
  onCancel,
  t,
  titleKey = 'cheque.discountTitle',
  confirmLabelKey = 'cheque.applyDiscount',
  subtitle,
}) {
  const effectiveMode = percentOnly ? 'percent' : mode;
  return (
    <RequestActionModal
      title={t(titleKey, { number: chequeNumber })}
      reasonLabel={t('cheque.discountReason')}
      confirmLabel={t(confirmLabelKey)}
      subtitle={subtitle}
      confirmClass="bg-amber-600 hover:bg-amber-700"
      t={t}
      onCancel={onCancel}
      onConfirm={({ reason }) => {
        const payload = { reason };
        if (effectiveMode === 'percent') payload.percent = Number(percent);
        else payload.amount = Number(amount);
        onConfirm(payload);
      }}
    >
      {!percentOnly ? (
        <div className="mb-3 flex gap-2 text-sm">
          <button
            type="button"
            onClick={() => onModeChange('amount')}
            className={`flex-1 rounded border px-2 py-1.5 ${
              mode === 'amount' ? 'border-amber-500 bg-amber-50' : ''
            }`}
          >
            {t('cheque.discountAmount')}
          </button>
          <button
            type="button"
            onClick={() => onModeChange('percent')}
            className={`flex-1 rounded border px-2 py-1.5 ${
              mode === 'percent' ? 'border-amber-500 bg-amber-50' : ''
            }`}
          >
            {t('cheque.discountPercent')}
          </button>
        </div>
      ) : null}
      {effectiveMode === 'amount' ? (
        <label className="mb-3 block text-sm">
          <span className="mb-1 block text-secondary">{t('cheque.discountAmount')}</span>
          <input
            type="number"
            min="0.01"
            step="0.01"
            value={amount}
            onChange={(e) => onAmountChange(e.target.value)}
            className="w-full rounded border px-3 py-2"
          />
        </label>
      ) : (
        <label className="mb-3 block text-sm">
          <span className="mb-1 block text-secondary">{t('cheque.discountPercent')}</span>
          <input
            type="number"
            min="1"
            max="100"
            value={percent}
            onChange={(e) => onPercentChange(e.target.value)}
            className="w-full rounded border px-3 py-2"
          />
        </label>
      )}
    </RequestActionModal>
  );
}
