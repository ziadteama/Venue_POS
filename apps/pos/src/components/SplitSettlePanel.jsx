import { PrinterIcon } from './icons.jsx';
import { openSplitChildren, parentPayableTotal } from '../utils/cheque.js';

export function SplitSettlePanel({
  cheque,
  t,
  paying,
  printing,
  onPayGuest,
  onPayRemainder,
  onPrintGuest,
  onPrintFull,
}) {
  const guests = openSplitChildren(cheque);
  const remainder = parentPayableTotal(cheque);
  const showRemainder = remainder > 0.009;

  if (!guests.length) return null;

  return (
    <section className="mb-4 rounded-2xl border border-violet-200/80 bg-violet-50/50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-violet-900">
            {t('pos.splitSettleTitle')}
          </p>
          <p className="mt-1 text-xs text-violet-800/80">{t('pos.splitSettleHint')}</p>
        </div>
        <button
          type="button"
          disabled={printing}
          onClick={onPrintFull}
          className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-white px-2.5 py-1.5 text-xs font-semibold text-violet-900 ring-1 ring-violet-200 hover:bg-violet-100 disabled:opacity-60"
        >
          <PrinterIcon className="h-3.5 w-3.5" />
          {t('pos.splitPrintFullShort')}
        </button>
      </div>

      <div className="mt-3 space-y-2">
        {guests.map((guest) => (
          <div
            key={guest.id}
            className="flex items-center gap-2 rounded-xl border border-violet-200/70 bg-white p-3"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-slate-900">{guest.splitLabel}</p>
              <p className="text-xs text-secondary">
                #{guest.chequeNumber} · {guest.total.toFixed(2)} {t('pos.currency')}
              </p>
            </div>
            <button
              type="button"
              disabled={printing}
              onClick={() => onPrintGuest(guest)}
              className="rounded-lg border border-slate-200 px-2.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              {t('pos.printCheck')}
            </button>
            <button
              type="button"
              disabled={paying}
              onClick={() => onPayGuest(guest)}
              className="rounded-lg bg-accent-gradient px-3 py-2 text-xs font-bold text-white disabled:opacity-60"
            >
              {t('pos.payGuest', { amount: guest.total.toFixed(0) })}
            </button>
          </div>
        ))}

        {showRemainder ? (
          <div className="flex items-center gap-2 rounded-xl border border-dashed border-violet-300 bg-violet-50/80 p-3">
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-slate-900">{t('pos.splitRemainder')}</p>
              <p className="text-xs text-secondary">
                #{cheque.chequeNumber} · {remainder.toFixed(2)} {t('pos.currency')}
              </p>
            </div>
            <button
              type="button"
              disabled={paying}
              onClick={onPayRemainder}
              className="rounded-lg bg-accent-gradient px-3 py-2 text-xs font-bold text-white disabled:opacity-60"
            >
              {t('pos.payGuest', { amount: remainder.toFixed(0) })}
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
