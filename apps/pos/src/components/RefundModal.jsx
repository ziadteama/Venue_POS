import { useEffect, useMemo, useState } from 'react';
import {
  defaultRefundMethod,
  remainingForMethod,
  summarizeRefundable,
} from '@venue-pos/shared';
import { ModalErrorAlert, ModalFrame, ModalPanel } from './ModalFrame.jsx';

function methodLabel(method, t) {
  const key = `orders.method.${method}`;
  const label = t(key);
  return label === key ? method : label;
}

export function RefundModal({ cheque, onConfirm, onCancel, t, error, submitting = false }) {
  const summary = useMemo(() => summarizeRefundable(cheque), [cheque]);
  const refundableMethods = summary.methods.filter((m) => m.remaining > 0.009);

  const [method, setMethod] = useState(() => defaultRefundMethod(summary));
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [restaurantManagerPin, setRestaurantManagerPin] = useState('');

  const [formError, setFormError] = useState('');

  const methodRemaining = remainingForMethod(summary, method);
  const amountNum = Number(amount) || 0;

  useEffect(() => {
    const nextMethod = defaultRefundMethod(summary);
    setMethod(nextMethod);
    const remaining = remainingForMethod(summary, nextMethod);
    setAmount(remaining > 0 ? String(Number(remaining.toFixed(2))) : '');
  }, [cheque?.id, summary]);

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

  async function handleSubmit(e) {
    e.preventDefault();
    if (!reason.trim()) {
      setFormError(t('pos.refundReasonRequired'));
      return;
    }
    if (amountNum <= 0 || amountNum > methodRemaining + 0.009) {
      setFormError(t('pos.refundAmountInvalid'));
      return;
    }
    setFormError('');
    await onConfirm({
      amount: amountNum,
      method,
      reason: reason.trim(),
      ...(restaurantManagerPin.length >= 4 ? { restaurantManagerPin } : {}),
    });
  }

  if (summary.remainingTotal <= 0.009) {
    return (
      <ModalFrame layer="nested">
        <ModalPanel>
          <ModalErrorAlert error={error} />
          <h3 className="text-lg font-semibold text-slate-900">
            {t('pos.refundTitle', { number: cheque?.chequeNumber })}
          </h3>
          <p className="mt-3 text-sm text-secondary">{t('pos.refundNothingLeft')}</p>
          <button
            type="button"
            onClick={onCancel}
            className="mt-4 rounded-lg border border-slate-300 px-4 py-2 text-secondary hover:bg-slate-50"
          >
            {t('common.cancel')}
          </button>
        </ModalPanel>
      </ModalFrame>
    );
  }

  return (
    <ModalFrame layer="nested">
      <ModalPanel>
        <form onSubmit={handleSubmit}>
          <ModalErrorAlert error={error} />
          {formError ? (
            <div
              role="alert"
              className="relative z-20 mb-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm font-medium text-amber-900"
            >
              {formError}
            </div>
          ) : null}

          <h3 className="text-lg font-semibold text-slate-900">
            {t('pos.refundTitle', { number: cheque?.chequeNumber })}
          </h3>
          <p className="mt-1 text-sm text-secondary">
            {cheque?.tableLabel
              ? t('pos.tableActive', { table: cheque.tableLabel })
              : t('pos.noTable')}
          </p>

          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
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
            <div className="mt-2 flex justify-between border-t border-slate-200 pt-2 font-semibold text-slate-900">
              <span>{t('pos.refundRemaining')}</span>
              <span>
                {summary.remainingTotal.toFixed(2)} {t('pos.currency')}
              </span>
            </div>
          </div>

          {refundableMethods.length > 0 ? (
            <ul className="mt-3 space-y-1 text-xs text-secondary">
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

          <label className="mb-3 mt-4 block text-sm">
            <span className="mb-1 block text-secondary">{t('pos.refundMethod')}</span>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
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
              <span className="text-secondary">{t('pos.refundAmount')}</span>
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
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
            />
            <p className="mt-1 text-xs text-secondary">
              {t('pos.refundMethodMax', {
                amount: methodRemaining.toFixed(2),
                currency: t('pos.currency'),
              })}
            </p>
          </label>

          <label className="mb-3 block text-sm">
            <span className="mb-1 block text-secondary">{t('pos.refundReason')}</span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
              placeholder={t('pos.refundReasonPlaceholder')}
            />
          </label>

          <label className="mb-4 block text-sm">
            <span className="mb-1 block font-medium text-slate-800">{t('pos.floorManagerPin')}</span>
            <p className="mb-2 text-xs text-secondary">{t('pos.refundPinOptional')}</p>
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={restaurantManagerPin}
              onChange={(e) => setRestaurantManagerPin(e.target.value.replace(/\D/g, ''))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 tracking-widest"
              autoComplete="off"
            />
          </label>

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={submitting || amountNum <= 0 || amountNum > methodRemaining + 0.009}
              className="rounded-lg bg-red-600 px-4 py-2 font-semibold text-white hover:bg-red-700 disabled:opacity-50"
            >
              {submitting ? t('common.loading') : t('pos.refundSubmit')}
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
      </ModalPanel>
    </ModalFrame>
  );
}
