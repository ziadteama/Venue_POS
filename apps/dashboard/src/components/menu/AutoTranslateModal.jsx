import { Modal } from '../ui/Modal.jsx';
import { Button } from '../ui/Button.jsx';

export function AutoTranslateModal({ t, suggestions, busy, onChange, onCancel, onApply }) {
  if (!suggestions.length) {
    return (
      <Modal
        onClose={onCancel}
        size="lg"
        title={t('menu.autoTranslateTitle')}
        footer={
          <Button variant="secondary" onClick={onCancel}>
            {t('common.cancel')}
          </Button>
        }
      >
        <p className="text-sm text-slate-600">{t('menu.autoTranslateEmpty')}</p>
      </Modal>
    );
  }

  return (
    <Modal
      onClose={busy ? undefined : onCancel}
      size="xl"
      title={t('menu.autoTranslateTitle')}
      subtitle={t('menu.autoTranslateHint')}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" onClick={onApply} loading={busy}>
            {t('menu.applySuggestions')}
          </Button>
        </>
      }
    >
      <div className="scrollbar-slim max-h-[60vh] space-y-3 overflow-y-auto">
        {suggestions.map((row, index) => (
          <div key={`${row.entityType}-${row.entityId}`} className="rounded-xl border border-slate-200 p-3">
            <p className="text-xs uppercase tracking-wide text-slate-400">{row.entityType}</p>
            <p className="mt-1 font-medium text-slate-900">{row.labelEn}</p>
            <input
              dir="rtl"
              className="premium-input mt-2"
              value={row.nameAr}
              onChange={(e) => onChange(index, e.target.value)}
            />
          </div>
        ))}
      </div>
    </Modal>
  );
}
