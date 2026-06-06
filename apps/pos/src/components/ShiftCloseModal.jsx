import { useMemo, useState } from 'react';

const OVER_SHORT_THRESHOLD = 50;

export function ShiftCloseModal({ shift, t, closing, onCancel, onConfirm }) {
  const expectedCash = shift?.report?.expectedCash ?? shift?.openFloat ?? 0;
  const [closeFloat, setCloseFloat] = useState(String(expectedCash));
  const [managerPin, setManagerPin] = useState('');

  const counted = Number(closeFloat) || 0;
  const overShort = useMemo(
    () => Number((counted - expectedCash).toFixed(2)),
    [counted, expectedCash],
  );
  const needsManager = Math.abs(overShort) > OVER_SHORT_THRESHOLD;

  function handleSubmit(e) {
    e.preventDefault();
    if (counted < 0) return;
    if (needsManager && managerPin.length < 4) return;
    onConfirm({ closeFloat: counted, managerPin: needsManager ? managerPin : undefined });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl"
      >
        <h3 className="mb-1 text-xl font-bold text-slate-900">{t('pos.shiftCloseTitle')}</h3>
        <p className="mb-4 text-sm text-secondary">{t('pos.shiftCloseHint')}</p>

        <div className="mb-3 rounded-lg bg-slate-50 px-3 py-2 text-sm">
          <div className="flex justify-between">
            <span>{t('pos.shiftExpectedCash')}</span>
            <span className="font-semibold">
              {expectedCash.toFixed(2)} {t('pos.currency')}
            </span>
          </div>
          {shift?.report?.totalRevenue != null && (
            <div className="mt-1 flex justify-between text-secondary">
              <span>{t('pos.shiftTotalSales')}</span>
              <span>
                {Number(shift.report.totalRevenue).toFixed(2)} {t('pos.currency')}
              </span>
            </div>
          )}
        </div>

        <label className="mb-3 block text-sm font-medium text-slate-700">
          {t('pos.shiftCloseFloat')}
          <input
            type="number"
            min="0"
            step="0.01"
            value={closeFloat}
            onChange={(e) => setCloseFloat(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
          />
        </label>

        {Math.abs(overShort) > 0.009 && (
          <p
            className={`mb-3 text-sm font-medium ${overShort < 0 ? 'text-rose-600' : 'text-amber-700'}`}
          >
            {t('pos.shiftOverShort', { amount: overShort.toFixed(2) })}
          </p>
        )}

        {needsManager && (
          <label className="mb-4 block text-sm font-medium text-slate-700">
            {t('pos.shiftManagerPin')}
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={managerPin}
              onChange={(e) => setManagerPin(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium"
          >
            {t('pos.shiftCancel')}
          </button>
          <button
            type="submit"
            disabled={closing}
            className="flex-1 rounded-lg bg-primary-to px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {closing ? t('pos.shiftClosing') : t('pos.shiftCloseConfirm')}
          </button>
        </div>
      </form>
    </div>
  );
}
