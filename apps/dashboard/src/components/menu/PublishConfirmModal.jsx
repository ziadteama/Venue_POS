export function PublishConfirmModal({ t, missingCount, busy, onCancel, onConfirm }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <h3 className="text-lg font-semibold text-slate-900">{t('menu.publishConfirmTitle')}</h3>
        <p className="mt-2 text-sm text-secondary">{t('menu.publishConfirmBody')}</p>
        {missingCount > 0 ? (
          <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {t('menu.publishMissingWarning', { count: missingCount })}
          </p>
        ) : null}
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            className="rounded-lg border px-4 py-2 text-sm"
            onClick={onCancel}
            disabled={busy}
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className="rounded-lg bg-primary-gradient px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            onClick={onConfirm}
            disabled={busy}
          >
            {t('menu.publishConfirmAction')}
          </button>
        </div>
      </div>
    </div>
  );
}
