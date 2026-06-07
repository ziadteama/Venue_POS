import { useState } from 'react';

const REFUND_METHODS = ['cash', 'card', 'voucher'];

export function RefundModal({ cheque, onConfirm, onCancel, t }) {
  const paidTotal = cheque?.payments?.reduce((s, p) => s + Number(p.amount), 0) ?? cheque?.total ?? 0;
  const refunded = cheque?.refunds?.reduce((s, r) => s + Number(r.amount), 0) ?? 0;
  const remaining = Math.max(0, paidTotal - refunded);

  const [amount, setAmount] = useState(remaining > 0 ? String(remaining) : '');
  const [method, setMethod] = useState(cheque?.payments?.[0]?.method ?? 'cash');
  const [reason, setReason] = useState('');
  const [restaurantManagerPin, setRestaurantManagerPin] = useState('');

  const amountNum = Number(amount) || 0;

  function handleSubmit(e) {
    e.preventDefault();
    if (!reason.trim() || restaurantManagerPin.length < 4) return;
    if (amountNum <= 0 || amountNum > remaining + 0.009) return;
    onConfirm({
      amount: amountNum,
      method,
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
        <h3 className="mb-2 text-lg font-semibold text-slate-900">
          {t('pos.refundTitle', { number: cheque?.chequeNumber })}
        </h3>
        <p className="mb-4 text-sm text-secondary">
          {t('pos.refundHint', { remaining: remaining.toFixed(2) })}
        </p>

        <label className="mb-3 block text-sm">
          <span className="mb-1 block text-secondary">{t('pos.refundAmount')}</span>
          <input
            type="number"
            min="0.01"
            step="0.01"
            max={remaining}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full rounded border px-3 py-2"
            autoFocus
          />
        </label>

        <label className="mb-3 block text-sm">
          <span className="mb-1 block text-secondary">{t('pos.refundMethod')}</span>
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            className="w-full rounded border px-3 py-2"
          >
            {REFUND_METHODS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>

        <label className="mb-3 block text-sm">
          <span className="mb-1 block text-secondary">{t('pos.refundReason')}</span>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            className="w-full rounded border px-3 py-2"
          />
        </label>

        <label className="mb-4 block text-sm">
          <span className="mb-1 block text-secondary">{t('pos.restaurantManagerPin')}</span>
          <p className="mb-2 text-xs text-secondary">{t('pos.refundPinHint')}</p>
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
            className="rounded-lg bg-red-600 px-4 py-2 font-medium text-white hover:bg-red-700"
          >
            {t('pos.refundSubmit')}
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
