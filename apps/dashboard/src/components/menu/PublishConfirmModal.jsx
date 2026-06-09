import { Modal } from '../ui/Modal.jsx';
import { Button } from '../ui/Button.jsx';

export function PublishConfirmModal({ t, missingCount, busy, onCancel, onConfirm }) {
  return (
    <Modal
      onClose={busy ? undefined : onCancel}
      title={t('menu.publishConfirmTitle')}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" onClick={onConfirm} loading={busy}>
            {t('menu.publishConfirmAction')}
          </Button>
        </>
      }
    >
      <p className="text-sm text-slate-600">{t('menu.publishConfirmBody')}</p>
      {missingCount > 0 ? (
        <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-900">
          {t('menu.publishMissingWarning', { count: missingCount })}
        </p>
      ) : null}
    </Modal>
  );
}
