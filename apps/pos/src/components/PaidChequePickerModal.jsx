import { summarizeRefundable } from '@venue-pos/shared';
import { ModalErrorAlert, ModalFrame, ModalPanel } from './ModalFrame.jsx';

export function PaidChequePickerModal({ cheques, loading, onSelect, onCancel, t, error }) {
  return (
    <ModalFrame layer="stacked">
      <ModalPanel wide>
        <ModalErrorAlert error={error} />
        <h3 className="mb-2 text-lg font-semibold text-slate-900">{t('pos.refundPickCheque')}</h3>
        <p className="mb-4 text-sm text-secondary">{t('pos.refundPickHint')}</p>

        {loading ? (
          <p className="text-sm text-secondary">{t('common.loading')}</p>
        ) : cheques.length === 0 ? (
          <p className="text-sm text-secondary">{t('pos.noPaidCheques')}</p>
        ) : (
          <ul className="mb-4 max-h-64 space-y-2 overflow-y-auto">
            {cheques.map((c) => {
              const summary = summarizeRefundable(c);
              const fullyRefunded = summary.remainingTotal <= 0.009;

              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(c)}
                    disabled={fullyRefunded}
                    className="flex w-full items-center justify-between rounded-lg border border-slate-200 px-4 py-3 text-start text-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <span>
                      {t('pos.chequeNumber', { number: c.chequeNumber })} - {c.tableLabel}
                    </span>
                    <span className="text-end">
                      <span className="block font-semibold text-primary-to">
                        {c.total.toFixed(2)} {t('pos.currency')}
                      </span>
                      <span
                        className={`block text-xs ${fullyRefunded ? 'text-secondary' : 'text-emerald-700'}`}
                      >
                        {fullyRefunded
                          ? t('pos.refundNothingLeft')
                          : t('pos.refundPickRemaining', {
                              remaining: summary.remainingTotal.toFixed(2),
                              currency: t('pos.currency'),
                            })}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-secondary hover:bg-slate-50"
        >
          {t('common.cancel')}
        </button>
      </ModalPanel>
    </ModalFrame>
  );
}
