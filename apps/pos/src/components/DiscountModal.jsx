import { useState } from 'react';

export function DiscountModal({ cheque, onConfirm, onCancel, t }) {
  const subtotal = cheque?.subtotalBeforeDiscount ?? cheque?.total ?? 0;
  const [mode, setMode] = useState('amount');
  const [amount, setAmount] = useState('');
  const [percent, setPercent] = useState('');
  const [reason, setReason] = useState('');
  const [restaurantManagerPin, setRestaurantManagerPin] = useState('');

  const amountNum = Number(amount) || 0;
  const percentNum = Number(percent) || 0;
  const preview =
    mode === 'percent'
      ? Number(((subtotal * percentNum) / 100).toFixed(2))
      : amountNum;

  function handleSubmit(e) {
    e.preventDefault();
    if (!reason.trim() || restaurantManagerPin.length < 4) return;
    if (mode === 'percent') {
      if (percentNum <= 0 || percentNum > 100) return;
      onConfirm({
        percent: percentNum,
        reason: reason.trim(),
        restaurantManagerPin,
      });
      return;
    }
    if (amountNum <= 0 || amountNum > subtotal) return;
    onConfirm({
      amount: amountNum,
      reason: reason.trim(),
      restaurantManagerPin,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl"
      >
        <h3 className="mb-2 text-lg font-semibold text-slate-900">{t('pos.discountTitle')}</h3>
        <p className="mb-4 text-sm text-secondary">{t('pos.discountRequestHint')}</p>

        <div className="mb-3 flex gap-2 text-sm">
          <button
            type="button"
            onClick={() => setMode('amount')}
            className={`flex-1 rounded-lg border px-3 py-2 ${
              mode === 'amount' ? 'border-primary-to bg-primary-from/5 font-medium' : ''
            }`}
          >
            {t('pos.discountAmount')}
          </button>
          <button
            type="button"
            onClick={() => setMode('percent')}
            className={`flex-1 rounded-lg border px-3 py-2 ${
              mode === 'percent' ? 'border-primary-to bg-primary-from/5 font-medium' : ''
            }`}
          >
            {t('pos.discountPercent')}
          </button>
        </div>

        {mode === 'amount' ? (
          <label className="mb-3 block text-sm">
            <span className="mb-1 block text-secondary">{t('pos.discountAmount')}</span>
            <input
              type="number"
              min="0.01"
              step="0.01"
              max={subtotal}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full rounded border px-3 py-2"
              autoFocus
            />
          </label>
        ) : (
          <label className="mb-3 block text-sm">
            <span className="mb-1 block text-secondary">{t('pos.discountPercent')}</span>
            <input
              type="number"
              min="1"
              max="100"
              step="1"
              value={percent}
              onChange={(e) => setPercent(e.target.value)}
              className="w-full rounded border px-3 py-2"
              autoFocus
            />
          </label>
        )}

        {preview > 0 && (
          <p className="mb-3 text-sm font-medium text-emerald-700">
            {t('pos.discountPreview', { amount: preview.toFixed(2) })}
          </p>
        )}

        <label className="mb-3 block text-sm">
          <span className="mb-1 block text-secondary">{t('pos.discountReason')}</span>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            className="w-full rounded border px-3 py-2"
          />
        </label>

        <label className="mb-4 block text-sm">
          <span className="mb-1 block text-secondary">{t('pos.restaurantManagerPin')}</span>
          <input
            type="password"
            inputMode="numeric"
            maxLength={6}
            value={restaurantManagerPin}
            onChange={(e) => setRestaurantManagerPin(e.target.value)}
            className="w-full rounded border px-3 py-2"
          />
        </label>

        <div className="flex gap-3">
          <button
            type="submit"
            className="rounded-lg bg-amber-600 px-4 py-2 font-medium text-white hover:bg-amber-700"
          >
            {t('pos.discountRequestSubmit')}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-slate-300 px-4 py-2 text-secondary hover:bg-slate-50"
          >
            {t('common.cancel')}
          </button>
        </div>
      </form>
    </div>
  );
}
