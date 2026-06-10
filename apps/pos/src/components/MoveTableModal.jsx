import { useState } from 'react';
import { OverlayPortal } from './ModalFrame.jsx';
import { CloseXIcon } from './icons.jsx';
import { isHubTableBlocked, tableLabelsMatch } from '../utils/cheque.js';

export function MoveTableModal({
  cheque,
  openCheques,
  venueTables = [],
  floorByLabel,
  onConfirm,
  onCancel,
  t,
}) {
  const [selected, setSelected] = useState('');

  const currentLabel = cheque?.tableLabel ?? '';

  function isOccupied(label) {
    if (isHubTableBlocked(label, {
      floorByLabel,
      chequeId: cheque?.id,
      crossVenueGroupId: cheque?.crossVenueGroupId,
    })) {
      return true;
    }
    return (openCheques ?? []).some(
      (c) =>
        c.id !== cheque?.id &&
        !c.parentChequeId &&
        tableLabelsMatch(c.tableLabel, label),
    );
  }

  const configuredTables = (venueTables ?? []).filter(
    (label) => !tableLabelsMatch(label, currentLabel),
  );

  const targetLabel = selected;
  const canSubmit = Boolean(targetLabel);

  function handleSubmit(e) {
    e.preventDefault();
    if (!canSubmit) return;
    onConfirm({ targetTableLabel: targetLabel });
  }

  return (
    <OverlayPortal layer="stacked" className="fixed inset-0 flex items-center justify-center bg-slate-900/40 p-4">
      <form
        onSubmit={handleSubmit}
        className="flex max-h-[90vh] w-full max-w-md flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">{t('pos.moveTableTitle')}</h3>
            <p className="text-sm text-slate-500">{t('pos.moveTableHint')}</p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
            aria-label={t('common.cancel')}
          >
            <CloseXIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="px-5 py-3 text-sm text-slate-500">
          <span>{t('pos.moveTableCurrent')}: </span>
          <span className="font-semibold text-slate-900">{currentLabel}</span>
        </div>

        {configuredTables.length > 0 ? (
          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-2">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              {t('pos.moveTableTarget')}
            </p>
            <div className="grid grid-cols-3 gap-2">
              {configuredTables.map((label) => {
                const occupied = isOccupied(label);
                const isChosen = selected === label;
                return (
                  <button
                    key={label}
                    type="button"
                    disabled={occupied}
                    onClick={() => setSelected(label)}
                    className={`rounded-xl border px-3 py-3 text-sm font-semibold transition ${
                      occupied
                        ? 'cursor-not-allowed border-slate-100 bg-slate-50 text-slate-300'
                        : isChosen
                          ? 'border-primary-to bg-primary-to/10 text-primary-to ring-1 ring-primary-to'
                          : 'border-slate-200 bg-white text-slate-800 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <span className="block">{label}</span>
                    {occupied ? (
                      <span className="mt-0.5 block text-[10px] font-medium text-slate-400">
                        {t('pos.moveTableOccupied')}
                      </span>
                    ) : (
                      <span className="mt-0.5 block text-[10px] font-medium text-emerald-500">
                        {t('pos.moveTableFree')}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        <div className="flex gap-2 border-t border-slate-100 px-5 py-4">
          <button
            type="submit"
            disabled={!canSubmit}
            className="flex-1 rounded-xl bg-primary-to py-3 text-sm font-semibold text-white shadow-sm transition hover:opacity-90 disabled:opacity-40"
          >
            {t('pos.moveTableConfirm')}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            {t('common.cancel')}
          </button>
        </div>
      </form>
    </OverlayPortal>
  );
}
