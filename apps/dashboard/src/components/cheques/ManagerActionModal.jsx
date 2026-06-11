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
  subtitle,
  pinOptional = false,
}) {
  const [pin, setPin] = useState('');
  const [reason, setReason] = useState('');

  function handleSubmit(e) {
    e.preventDefault();
    if (!reason.trim()) return;
    if (!pinOptional && !pin.trim()) return;
    const payload = { reason: reason.trim() };
    if (pin.trim()) payload.managerPin = pin.trim();
    onConfirm(payload);
  }

  return (
    <ModalShell layer="critical">
      <form onSubmit={handleSubmit}>
        <h3 className="mb-2 text-lg font-semibold text-slate-900">{title}</h3>
        {subtitle ? <p className="mb-4 text-sm text-secondary">{subtitle}</p> : null}
        {!pinOptional ? (
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
        ) : null}
        <label className="mb-4 block text-sm">
          <span className="mb-1 block text-secondary">{reasonLabel}</span>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            className="w-full rounded border px-3 py-2"
            autoFocus={pinOptional}
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
