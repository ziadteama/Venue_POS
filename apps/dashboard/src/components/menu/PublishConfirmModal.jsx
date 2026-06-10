import { Modal } from '../ui/Modal.jsx';
import { Button } from '../ui/Button.jsx';

export function PublishConfirmModal({ t, venueName, busy, onCancel, onConfirm }) {
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
      <p className="text-sm text-slate-600">
        {t('menu.publishConfirmBody', { venue: venueName })}
      </p>
    </Modal>
  );
}
