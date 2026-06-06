export function PaidChequePickerModal({ cheques, loading, onSelect, onCancel, t }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
        <h3 className="mb-2 text-lg font-semibold text-slate-900">{t('pos.refundPickCheque')}</h3>
        <p className="mb-4 text-sm text-secondary">{t('pos.refundPickHint')}</p>

        {loading ? (
          <p className="text-sm text-secondary">{t('common.loading')}</p>
        ) : cheques.length === 0 ? (
          <p className="text-sm text-secondary">{t('pos.noPaidCheques')}</p>
        ) : (
          <ul className="mb-4 max-h-64 space-y-2 overflow-y-auto">
            {cheques.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => onSelect(c)}
                  className="flex w-full items-center justify-between rounded-lg border border-slate-200 px-4 py-3 text-start text-sm hover:bg-slate-50"
                >
                  <span>
                    {t('pos.chequeNumber', { number: c.chequeNumber })} — {c.tableLabel}
                  </span>
                  <span className="font-semibold text-primary-to">
                    {c.total.toFixed(2)} {t('pos.currency')}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-secondary hover:bg-slate-50"
        >
          {t('common.cancel')}
        </button>
      </div>
    </div>
  );
}
