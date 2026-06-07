export function AutoTranslateModal({
  t,
  suggestions,
  busy,
  onChange,
  onCancel,
  onApply,
}) {
  if (!suggestions.length) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
        <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
          <h3 className="text-lg font-semibold">{t('menu.autoTranslateTitle')}</h3>
          <p className="mt-2 text-sm text-secondary">{t('menu.autoTranslateEmpty')}</p>
          <div className="mt-6 flex justify-end">
            <button type="button" className="rounded-lg border px-4 py-2 text-sm" onClick={onCancel}>
              {t('common.cancel')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-xl">
        <div className="border-b px-6 py-4">
          <h3 className="text-lg font-semibold text-slate-900">{t('menu.autoTranslateTitle')}</h3>
          <p className="mt-1 text-sm text-secondary">{t('menu.autoTranslateHint')}</p>
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto p-6">
          {suggestions.map((row, index) => (
            <div key={`${row.entityType}-${row.entityId}`} className="rounded-lg border p-3">
              <p className="text-xs uppercase tracking-wide text-secondary">{row.entityType}</p>
              <p className="mt-1 font-medium text-slate-900">{row.labelEn}</p>
              <input
                dir="rtl"
                className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2"
                value={row.nameAr}
                onChange={(e) => onChange(index, e.target.value)}
              />
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-2 border-t px-6 py-4">
          <button type="button" className="rounded-lg border px-4 py-2 text-sm" onClick={onCancel}>
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className="rounded-lg bg-primary-gradient px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            onClick={onApply}
            disabled={busy}
          >
            {t('menu.applySuggestions')}
          </button>
        </div>
      </div>
    </div>
  );
}
