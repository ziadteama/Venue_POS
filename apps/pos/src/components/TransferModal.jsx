import { useState } from 'react';
import { transferableItems } from '../utils/cheque.js';
import { OverlayPortal } from './ModalFrame.jsx';

export function TransferModal({ cheque, openCheques, language, onConfirm, onCancel, t }) {
  const items = transferableItems(cheque);
  const [selected, setSelected] = useState([]);
  const [targetTable, setTargetTable] = useState('');
  const [managerPin, setManagerPin] = useState('');
  const [reason, setReason] = useState('');

  const otherTables = [
    ...new Set(
      openCheques
        .filter((c) => c.id !== cheque?.id && !c.parentChequeId)
        .map((c) => c.tableLabel),
    ),
  ];

  function toggle(id) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!selected.length || !targetTable.trim() || managerPin.length < 4) return;
    onConfirm({
      itemIds: selected,
      targetTableLabel: targetTable.trim(),
      managerPin,
      reason: reason.trim() || undefined,
    });
  }

  return (
    <OverlayPortal layer="stacked" className="fixed inset-0 flex items-center justify-center bg-slate-900/40 p-4">
      <form
        onSubmit={handleSubmit}
        className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-xl border border-slate-200 bg-white p-6 shadow-xl"
      >
        <h3 className="mb-1 text-xl font-bold text-slate-900">{t('pos.transferTitle')}</h3>
        <p className="mb-4 text-sm text-secondary">{t('pos.transferHint')}</p>

        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
          {items.map((item) => (
            <label
              key={item.id}
              className="flex cursor-pointer items-center gap-2 rounded border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50"
            >
              <input
                type="checkbox"
                checked={selected.includes(item.id)}
                onChange={() => toggle(item.id)}
              />
              <span className="flex-1">
                {item.quantity}x {language === 'ar' ? item.nameAr : item.nameEn}
              </span>
            </label>
          ))}
        </div>

        <label className="mt-4 block text-sm">
          <span className="mb-1 block text-secondary">{t('pos.transferTargetTable')}</span>
          <input
            list="transfer-tables"
            value={targetTable}
            onChange={(e) => setTargetTable(e.target.value)}
            className="w-full rounded border px-3 py-2"
            placeholder="T5"
          />
          <datalist id="transfer-tables">
            {otherTables.map((tbl) => (
              <option key={tbl} value={tbl} />
            ))}
          </datalist>
        </label>

        <label className="mt-3 block text-sm">
          <span className="mb-1 block text-secondary">{t('pos.shiftManagerPin')}</span>
          <input
            type="password"
            inputMode="numeric"
            maxLength={6}
            value={managerPin}
            onChange={(e) => setManagerPin(e.target.value)}
            className="w-full rounded border px-3 py-2"
          />
        </label>

        <label className="mt-3 block text-sm">
          <span className="mb-1 block text-secondary">{t('pos.transferReason')}</span>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full rounded border px-3 py-2"
          />
        </label>

        <div className="mt-4 flex gap-2">
          <button
            type="submit"
            disabled={!selected.length || !targetTable.trim() || managerPin.length < 4}
            className="flex-1 rounded-lg bg-primary-to py-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            {t('pos.transferConfirm')}
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
    </OverlayPortal>
  );
}
