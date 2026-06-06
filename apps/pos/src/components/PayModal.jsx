import { useState } from 'react';

export function PayModal({ cheque, onConfirm, onCancel, t }) {
  const total = cheque?.total ?? 0;
  const [mode, setMode] = useState('cash');
  const [tendered, setTendered] = useState(String(total || ''));
  const [cashPart, setCashPart] = useState('');
  const [cardPart, setCardPart] = useState('');

  const tenderNum = Number(tendered) || 0;
  const cashNum = Number(cashPart) || 0;
  const cardNum = Number(cardPart) || 0;
  const change = mode === 'cash' ? Math.max(0, tenderNum - total) : 0;
  const splitRemaining = total - cashNum - cardNum;

  function handleSubmit(e) {
    e.preventDefault();
    if (mode === 'cash') {
      if (tenderNum < total) return;
      onConfirm({
        payments: [{ method: 'cash', amount: total }],
        tendered: tenderNum,
      });
      return;
    }
    if (Math.abs(splitRemaining) > 0.009 || cashNum + cardNum <= 0) return;
    const payments = [];
    if (cashNum > 0) payments.push({ method: 'cash', amount: cashNum });
    if (cardNum > 0) payments.push({ method: 'card', amount: cardNum });
    onConfirm({ payments, tendered: cashNum > 0 ? cashNum : undefined });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl"
      >
        <h3 className="mb-1 text-xl font-bold text-slate-900">{t('pos.payTitle')}</h3>
        <p className="mb-4 text-sm text-secondary">
          {t('pos.chequeNumber', { number: cheque.chequeNumber })} ·{' '}
          <span className="font-semibold text-primary-to">
            {total.toFixed(2)} {t('pos.currency')}
          </span>
        </p>

        <div className="mb-4 flex gap-2">
          <button
            type="button"
            onClick={() => setMode('cash')}
            className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium ${
              mode === 'cash'
                ? 'bg-primary-gradient text-white'
                : 'border border-slate-200 text-secondary'
            }`}
          >
            {t('pos.payCash')}
          </button>
          <button
            type="button"
            onClick={() => setMode('split')}
            className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium ${
              mode === 'split'
                ? 'bg-primary-gradient text-white'
                : 'border border-slate-200 text-secondary'
            }`}
          >
            {t('pos.paySplit')}
          </button>
        </div>

        {mode === 'cash' ? (
          <>
            <label className="mb-3 block text-sm">
              <span className="mb-1 block text-secondary">{t('pos.tendered')}</span>
              <input
                type="number"
                min={total}
                step="0.01"
                value={tendered}
                onChange={(e) => setTendered(e.target.value)}
                className="w-full rounded border px-3 py-2 text-lg font-semibold"
                autoFocus
              />
            </label>
            <p className="mb-4 text-lg font-bold text-emerald-700">
              {t('pos.changeDue')}: {change.toFixed(2)} {t('pos.currency')}
            </p>
          </>
        ) : (
          <>
            <label className="mb-3 block text-sm">
              <span className="mb-1 block text-secondary">{t('pos.payCash')}</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={cashPart}
                onChange={(e) => setCashPart(e.target.value)}
                className="w-full rounded border px-3 py-2"
                placeholder="0.00"
              />
            </label>
            <label className="mb-3 block text-sm">
              <span className="mb-1 block text-secondary">{t('pos.payCard')}</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={cardPart}
                onChange={(e) => setCardPart(e.target.value)}
                className="w-full rounded border px-3 py-2"
                placeholder="0.00"
              />
            </label>
            <p
              className={`mb-4 text-sm font-medium ${
                Math.abs(splitRemaining) < 0.01 ? 'text-emerald-700' : 'text-red-600'
              }`}
            >
              {t('pos.remaining')}: {splitRemaining.toFixed(2)} {t('pos.currency')}
            </p>
          </>
        )}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={
              mode === 'cash'
                ? tenderNum < total
                : Math.abs(splitRemaining) > 0.009 || cashNum + cardNum <= 0
            }
            className="flex-1 rounded-lg bg-emerald-600 py-3 font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {t('pos.completePay')}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-slate-300 px-4 py-3 text-secondary hover:bg-slate-50"
          >
            {t('common.cancel')}
          </button>
        </div>
      </form>
    </div>
  );
}
