import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiFetch } from '../api/client.js';
import { friendlyError } from '../utils/apiError.js';
import { SectionCard } from './ui/Card.jsx';

const PREVIEW_TYPES = [
  { id: 'customer', labelKey: 'receiptPreview.customer' },
  { id: 'restaurant', labelKey: 'receiptPreview.restaurant' },
  { id: 'prePayment', labelKey: 'receiptPreview.prePayment' },
];

export function ReceiptPreviewSection({ venueId }) {
  const { t } = useTranslation();
  const [activeType, setActiveType] = useState('customer');
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!venueId) return;
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch(
        `/api/v1/manager/venues/${venueId}/receipt-preview?type=${encodeURIComponent(activeType)}`,
      );
      setText(res.text ?? '');
    } catch (err) {
      setError(friendlyError(err, t('receiptPreview.loadFailed')));
      setText('');
    } finally {
      setLoading(false);
    }
  }, [venueId, activeType, t]);

  useEffect(() => {
    load();
  }, [load]);

  if (!venueId) {
    return (
      <SectionCard title={t('receiptPreview.title')}>
        <p className="text-sm text-slate-500">{t('venueConfig.venue')}</p>
      </SectionCard>
    );
  }

  return (
    <SectionCard title={t('receiptPreview.title')} hint={t('receiptPreview.subtitle')}>
      <div className="flex flex-wrap gap-2">
        {PREVIEW_TYPES.map((type) => (
          <button
            key={type.id}
            type="button"
            onClick={() => setActiveType(type.id)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
              activeType === type.id
                ? 'bg-accent-50 text-accent-700 ring-1 ring-accent-200'
                : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
            }`}
          >
            {t(type.labelKey)}
          </button>
        ))}
      </div>

      {error ? (
        <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
        {loading ? (
          <p className="text-sm text-slate-500">{t('common.loading')}</p>
        ) : (
          <pre className="scrollbar-slim max-h-[28rem] overflow-auto whitespace-pre-wrap font-mono text-xs leading-relaxed text-slate-800">
            {text || t('receiptPreview.empty')}
          </pre>
        )}
      </div>

      <p className="mt-3 text-xs text-slate-500">{t('receiptPreview.hint')}</p>
    </SectionCard>
  );
}
