import { useEffect, useMemo, useState } from 'react';
import {
  defaultRefundMethod,
  remainingForMethod,
  summarizeRefundable,
} from '@venue-pos/shared';
import { ModalShell } from './ModalShell.jsx';

function methodLabel(method, t) {
  const key = `orders.method.${method}`;
  const label = t(key);
  return label === key ? method : label;
}

export function ChequeRefundModal({
  cheque,
  chequeNumber,
  onConfirm,
  onCancel,
  t,
  error,
  submitting = false,
}) {
  const summary = useMemo(() => summarizeRefundable(cheque), [cheque]);
  const refundableMethods = summary.methods.filter((m) => m.remaining > 0.009);

  const [method, setMethod] = useState(() => defaultRefundMethod(summary));
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');

  const methodRemaining = remainingForMethod(summary, method);
  const amountNum = Number(amount) || 0;

  useEffect(() => {
    const nextMethod = defaultRefundMethod(summary);
    setMethod(nextMethod);
    const remaining = remainingForMethod(summary, nextMethod);
    setAmount(remaining > 0 ? String(Number(remaining.toFixed(2))) : '');
  }, [cheque?.id, summary.remainingTotal]);

  useEffect(() => {
    if (methodRemaining <= 0) return;
    setAmount((prev) => {
      const prevNum = Number(prev) || 0;
      if (prev === '' || prevNum > methodRemaining + 0.009) {
        return String(Number(methodRemaining.toFixed(2)));
      }
      return prev;
    });
  }, [method, methodRemaining]);

  function applyFullRemaining() {
    if (methodRemaining > 0) {
      setAmount(String(Number(methodRemaining.toFixed(2))));
    }
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!reason.trim()) return;
    if (amountNum <= 0 || amountNum > methodRemaining + 0.009) return;
    onConfirm({ reason: reason.trim(), amount: amountNum, method });
  }

  if (summary.remainingTotal <= 0.009) {
    return (
      <ModalShell>
        <h3 className="mb-2 text-lg font-semibold text-slate-900">
          {t('cheque.refundTitle', { number: chequeNumber })}
        </h3>
        <p className="text-sm text-secondary">{t('pos.refundNothingLeft')}</p>
        <button
          type="button"
          onClick={onCancel}
          className="mt-4 rounded-lg border border-slate-300 px-4 py-2 text-secondary hover:bg-slate-50"
        >
          {t('common.cancel')}
        </button>
      </ModalShell>
    );
  }

  return (
    <ModalShell layer="nested" error={error}>
      <form onSubmit={handleSubmit}>
        <h3 className="mb-1 text-lg font-semibold text-slate-900">
          {t('cheque.refundTitle', { number: chequeNumber })}
        </h3>
        <p className="mb-4 text-sm text-secondary">{t('cheque.refundHubHint')}</p>

        <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
          <div className="flex justify-between">
            <span className="text-secondary">{t('pos.refundPaidTotal')}</span>
            <span className="font-medium">
              {summary.paidTotal.toFixed(2)} {t('pos.currency')}
            </span>
          </div>
          {summary.refundedTotal > 0.009 ? (
            <div className="mt-1 flex justify-between text-red-700">
              <span>{t('pos.refundAlready')}</span>
              <span>
                -{summary.refundedTotal.toFixed(2)} {t('pos.currency')}
              </span>
            </div>
          ) : null}
          <div className="mt-2 flex justify-between border-t border-slate-200 pt-2 font-semibold">
            <span>{t('pos.refundRemaining')}</span>
            <span>
              {summary.remainingTotal.toFixed(2)} {t('pos.currency')}
            </span>
          </div>
        </div>

        {refundableMethods.length > 0 ? (
          <ul className="mb-3 space-y-1 text-xs text-secondary">
            {refundableMethods.map((row) => (
              <li key={row.method} className="flex justify-between">
                <span>{methodLabel(row.method, t)}</span>
                <span>
                  {t('pos.refundMethodCap', {
                    remaining: row.remaining.toFixed(2),
                    currency: t('pos.currency'),
                  })}
                </span>
              </li>
            ))}
          </ul>
        ) : null}

        <label className="mb-3 block text-sm">
          <span className="mb-1 block text-secondary">{t('cheque.refundMethod')}</span>
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            className="w-full rounded border px-3 py-2"
            disabled={refundableMethods.length <= 1}
          >
            {refundableMethods.map((row) => (
              <option key={row.method} value={row.method}>
                {methodLabel(row.method, t)} ({row.remaining.toFixed(2)} {t('pos.currency')})
              </option>
            ))}
          </select>
        </label>

        <label className="mb-3 block text-sm">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-secondary">{t('cheque.refundAmount')}</span>
            <button
              type="button"
              onClick={applyFullRemaining}
              className="text-xs font-medium text-primary-to hover:underline"
            >
              {t('pos.refundFullMethod')}
            </button>
          </div>
          <input
            type="number"
            min="0.01"
            step="0.01"
            max={methodRemaining}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full rounded border px-3 py-2"
          />
          <p className="mt-1 text-xs text-secondary">
            {t('pos.refundMethodMax', {
              amount: methodRemaining.toFixed(2),
              currency: t('pos.currency'),
            })}
          </p>
        </label>

        <label className="mb-4 block text-sm">
          <span className="mb-1 block text-secondary">{t('cheque.refundReason')}</span>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            className="w-full rounded border px-3 py-2"
            placeholder={t('pos.refundReasonPlaceholder')}
          />
        </label>

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={
              submitting || amountNum <= 0 || amountNum > methodRemaining + 0.009 || !reason.trim()
            }
            className="rounded-lg bg-red-600 px-4 py-2 font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            {submitting ? t('common.loading') : t('cheque.processRefund')}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="rounded-lg border border-slate-300 px-4 py-2 text-secondary hover:bg-slate-50"
          >
            {t('common.cancel')}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}
