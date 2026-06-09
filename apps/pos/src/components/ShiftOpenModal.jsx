import { useState } from 'react';
import { OverlayPortal } from './ModalFrame.jsx';

export function ShiftOpenModal({
  t,
  opening,
  openChequeCount = 0,
  error,
  onCancel,
  onConfirm,
}) {
  const [openFloat, setOpenFloat] = useState('0');

  function handleSubmit(e) {
    e.preventDefault();
    const value = Number(openFloat);
    if (!Number.isFinite(value) || value < 0) return;
    onConfirm(value);
  }

  function handleCancel() {
    setOpenFloat('0');
    onCancel();
  }

  return (
    <OverlayPortal layer="stacked" className="fixed inset-0 flex items-center justify-center bg-slate-900/50 p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-xl"
      >
        <h3 className="mb-1 text-xl font-bold text-slate-900">{t('pos.shiftOpenTitle')}</h3>
        <p className="mb-4 text-sm text-secondary">{t('pos.shiftOpenHint')}</p>

        {openChequeCount > 0 ? (
          <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {t('pos.shiftOpenOpenCheques', { count: openChequeCount })}
          </p>
        ) : null}

        {error ? (
          <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        ) : null}

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

        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleCancel}
            disabled={opening}
            className="flex-1 rounded-lg border border-slate-300 px-4 py-3 text-sm font-medium text-slate-700 disabled:opacity-60"
          >
            {t('pos.shiftCancel')}
          </button>
          <button
            type="submit"
            disabled={opening}
            className="flex-1 rounded-lg bg-primary-to px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
          >
            {opening ? t('pos.shiftOpening') : t('pos.shiftOpenConfirm')}
          </button>
        </div>
      </form>
    </OverlayPortal>
  );
}
