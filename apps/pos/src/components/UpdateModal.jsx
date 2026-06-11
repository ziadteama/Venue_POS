export function UpdateModal({
  t,
  phase,
  version,
  progress,
  error,
  busy,
  onDismiss,
  onDownload,
  onInstall,
}) {
  const title =
    phase === 'ready'
      ? t('pos.updateReadyTitle')
      : phase === 'downloading'
        ? t('pos.updateDownloadingTitle')
        : phase === 'error'
          ? t('pos.updateErrorTitle')
          : t('pos.updateAvailableTitle');

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/60 p-4">
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
      >
        <h3 className="mb-1 text-xl font-bold text-slate-900">{title}</h3>
        {version ? (
          <p className="mb-4 text-sm text-slate-600">{t('pos.updateVersion', { version })}</p>
        ) : (
          <p className="mb-4 text-sm text-slate-600">{t('pos.updateShiftCloseHint')}</p>
        )}

        {phase === 'downloading' ? (
          <div className="mb-4">
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-primary-to transition-all"
                style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-slate-500">
              {t('pos.updateProgress', { percent: Math.round(progress) })}
            </p>
          </div>
        ) : null}

        {error ? <p className="mb-4 text-sm text-red-600">{error}</p> : null}

        <div className="flex flex-wrap justify-end gap-2">
          {phase === 'available' ? (
            <>
              <button
                type="button"
                onClick={onDismiss}
                disabled={busy}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium disabled:opacity-60"
              >
                {t('pos.updateLater')}
              </button>
              <button
                type="button"
                onClick={onDownload}
                disabled={busy}
                className="rounded-lg bg-primary-to px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {t('pos.updateDownload')}
              </button>
            </>
          ) : null}
          {phase === 'ready' ? (
            <>
              <button
                type="button"
                onClick={onDismiss}
                disabled={busy}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium disabled:opacity-60"
              >
                {t('pos.updateLater')}
              </button>
              <button
                type="button"
                onClick={onInstall}
                disabled={busy}
                className="rounded-lg bg-primary-to px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {busy ? t('pos.updateRestarting') : t('pos.updateInstallNow')}
              </button>
            </>
          ) : null}
          {phase === 'downloading' ? (
            <button
              type="button"
              onClick={onDismiss}
              disabled={busy}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium disabled:opacity-60"
            >
              {t('pos.updateBackground')}
            </button>
          ) : null}
          {phase === 'error' ? (
            <button
              type="button"
              onClick={onDismiss}
              className="rounded-lg bg-primary-to px-4 py-2 text-sm font-semibold text-white"
            >
              {t('pos.updateDismiss')}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
