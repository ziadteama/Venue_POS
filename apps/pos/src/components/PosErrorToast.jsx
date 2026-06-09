import { MODAL_Z } from '@venue-pos/shared';

/** Floating alert above all modals when a session error occurs during overlay flows. */
export function PosErrorToast({ message, onDismiss, t }) {
  if (!message) return null;

  return (
    <div
      role="alert"
      className="pointer-events-auto fixed inset-x-4 top-4 mx-auto w-full max-w-lg rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm font-medium text-red-800 shadow-lg"
      style={{ zIndex: MODAL_Z.toast }}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="min-w-0 flex-1">{message}</span>
        {onDismiss ? (
          <button
            type="button"
            onClick={onDismiss}
            className="shrink-0 text-xs font-semibold text-red-700 hover:underline"
          >
            {t('pos.dismissNotification')}
          </button>
        ) : null}
      </div>
    </div>
  );
}
