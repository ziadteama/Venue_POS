import { useState } from 'react';
import { ModalShell } from './ModalShell.jsx';

export function ManagerActionModal({
  title,
  reasonLabel,
  confirmLabel,
  confirmClass,
  onConfirm,
  onCancel,
  t,
}) {
  const [pin, setPin] = useState('');
  const [reason, setReason] = useState('');

  function handleSubmit(e) {
    e.preventDefault();
    if (!pin.trim() || !reason.trim()) return;
    onConfirm({ managerPin: pin.trim(), reason: reason.trim() });
  }

  return (
    <ModalShell>
      <form onSubmit={handleSubmit}>
        <h3 className="mb-4 text-lg font-semibold text-slate-900">{title}</h3>
        <label className="mb-3 block text-sm">
          <span className="mb-1 block text-secondary">{t('cheque.managerPin')}</span>
          <input
            type="password"
            inputMode="numeric"
            maxLength={6}
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            className="w-full rounded border px-3 py-2"
            autoFocus
          />
        </label>
        <label className="mb-4 block text-sm">
          <span className="mb-1 block text-secondary">{reasonLabel}</span>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            className="w-full rounded border px-3 py-2"
          />
        </label>
        <div className="flex gap-3">
          <button
            type="submit"
            className={`rounded-lg px-4 py-2 font-medium text-white ${confirmClass}`}
          >
            {confirmLabel}
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
    </ModalShell>
  );
}
