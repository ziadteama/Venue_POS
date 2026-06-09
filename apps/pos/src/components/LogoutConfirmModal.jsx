import { OverlayPortal } from './ModalFrame.jsx';

export function LogoutConfirmModal({ t, reason, onCancel, onConfirm, onCloseShift }) {
  const blocked = Boolean(reason);

  return (
    <OverlayPortal layer="stacked" className="fixed inset-0 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
        <h3 className="text-lg font-semibold text-slate-900">
          {blocked ? t('pos.logoutBlockedTitle') : t('pos.logoutConfirmTitle')}
        </h3>
        <p className="mt-2 text-sm text-secondary">
          {blocked ? reason : t('pos.logoutConfirmHint')}
        </p>
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50"
          >
            {t('common.cancel')}
          </button>
          {blocked && onCloseShift ? (
            <button
              type="button"
              onClick={onCloseShift}
              className="rounded-lg bg-primary-to px-4 py-2 text-sm font-semibold text-white"
            >
              {t('pos.shiftCloseTitle')}
            </button>
          ) : null}
          {!blocked ? (
            <button
              type="button"
              onClick={onConfirm}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
            >
              {t('pos.logout')}
            </button>
          ) : null}
        </div>
      </div>
    </OverlayPortal>
  );
}
