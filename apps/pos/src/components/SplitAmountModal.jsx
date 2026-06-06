import { useMemo, useState } from 'react';

export function SplitAmountModal({ cheque, onConfirm, onCancel, t }) {
  const total = cheque?.total ?? 0;
  const [guests, setGuests] = useState(() => [
    { label: t('pos.splitGuest', { n: 1 }), amount: '' },
    { label: t('pos.splitGuest', { n: 2 }), amount: '' },
  ]);

  const sum = useMemo(
    () => guests.reduce((s, g) => s + (Number(g.amount) || 0), 0),
    [guests],
  );
  const remaining = total - sum;

  function handleSubmit(e) {
    e.preventDefault();
    const splits = guests
      .map((g) => ({ label: g.label, amount: Number(g.amount) }))
      .filter((g) => g.amount > 0);
    if (!splits.length || Math.abs(remaining) > 0.009) return;
    onConfirm({ splits });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl"
      >
        <h3 className="mb-1 text-xl font-bold text-slate-900">{t('pos.splitAmountTitle')}</h3>
        <p className="mb-4 text-sm text-secondary">
          {t('pos.splitAmountHint', { total: total.toFixed(2) })}
        </p>

        <div className="space-y-3">
          {guests.map((guest, idx) => (
            <label key={guest.label} className="block text-sm">
              <span className="mb-1 block font-medium text-slate-800">{guest.label}</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={guest.amount}
                onChange={(e) =>
                  setGuests((prev) =>
                    prev.map((g, i) => (i === idx ? { ...g, amount: e.target.value } : g)),
                  )
                }
                className="w-full rounded border px-3 py-2"
              />
            </label>
          ))}
        </div>

        <p
          className={`mt-3 text-sm font-medium ${
            Math.abs(remaining) < 0.01 ? 'text-emerald-700' : 'text-red-600'
          }`}
        >
          {t('pos.remaining')}: {remaining.toFixed(2)} {t('pos.currency')}
        </p>

        <div className="mt-4 flex gap-2">
          <button
            type="submit"
            disabled={Math.abs(remaining) > 0.009}
            className="flex-1 rounded-lg bg-primary-to py-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            {t('pos.splitConfirm')}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-slate-300 px-4 py-3 text-secondary"
          >
            {t('common.cancel')}
          </button>
        </div>
      </form>
    </div>
  );
}
