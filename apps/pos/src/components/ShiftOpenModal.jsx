import { useState } from 'react';

export function ShiftOpenModal({ t, opening, onConfirm }) {
  const [openFloat, setOpenFloat] = useState('0');

  function handleSubmit(e) {
    e.preventDefault();
    const value = Number(openFloat);
    if (!Number.isFinite(value) || value < 0) return;
    onConfirm(value);
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-xl"
      >
        <h3 className="mb-1 text-xl font-bold text-slate-900">{t('pos.shiftOpenTitle')}</h3>
        <p className="mb-4 text-sm text-secondary">{t('pos.shiftOpenHint')}</p>
        <label className="mb-4 block text-sm font-medium text-slate-700">
          {t('pos.shiftOpenFloat')}
          <input
            type="number"
            min="0"
            step="0.01"
            value={openFloat}
            onChange={(e) => setOpenFloat(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-lg"
            autoFocus
          />
        </label>
        <button
          type="submit"
          disabled={opening}
          className="w-full rounded-lg bg-primary-to px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
        >
          {opening ? t('pos.shiftOpening') : t('pos.shiftOpenConfirm')}
        </button>
      </form>
    </div>
  );
}
