import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiFetch } from '../api/client.js';
import { friendlyError } from '../utils/apiError.js';
import { SectionCard } from './ui/Card.jsx';
import { Button } from './ui/Button.jsx';
import { Field, Input } from './ui/Field.jsx';
import { AlertIcon, CheckCircleIcon } from './dashboard/icons.jsx';

const TOGGLE_KEYS = [
  'manualCardPayment',
  'kdsEnabled',
  'lineTransfer',
  'discounts',
  'refunds',
  'autoReceiptPrint',
  'crossVenueBilling',
];

export function FeaturesSection() {
  const { t } = useTranslation();
  const [features, setFeatures] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await apiFetch('/api/v1/manager/hub-settings/features');
      setFeatures(data);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function save() {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const data = await apiFetch('/api/v1/manager/hub-settings/features', {
        method: 'PUT',
        body: JSON.stringify(features),
      });
      setFeatures(data);
      setSuccess(t('features.saved'));
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setSaving(false);
    }
  }

  function toggle(key) {
    setFeatures((f) => ({ ...f, [key]: !f[key] }));
  }

  if (loading) {
    return <p className="text-sm text-slate-500">{t('common.loading')}</p>;
  }

  return (
    <SectionCard title={t('features.title')} subtitle={t('features.subtitle')}>
      {error ? (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <AlertIcon className="h-4 w-4" />
          {error}
        </div>
      ) : null}
      {success ? (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          <CheckCircleIcon className="h-4 w-4" />
          {success}
        </div>
      ) : null}

      <div className="space-y-4">
        {TOGGLE_KEYS.map((key) => (
          <label key={key} className="flex cursor-pointer items-center justify-between gap-4">
            <div>
              <p className="font-medium text-slate-900">{t(`features.${key}`)}</p>
              <p className="text-sm text-slate-500">{t(`features.${key}Hint`)}</p>
            </div>
            <input
              type="checkbox"
              className="h-5 w-5 rounded border-slate-300"
              checked={Boolean(features?.[key])}
              onChange={() => toggle(key)}
            />
          </label>
        ))}

        <Field label={t('features.manualCardApprovalThreshold')}>
          <Input
            type="number"
            min={0}
            value={features?.manualCardApprovalThreshold ?? 500}
            onChange={(e) =>
              setFeatures((f) => ({
                ...f,
                manualCardApprovalThreshold: Number(e.target.value),
              }))
            }
          />
        </Field>
      </div>

      <div className="mt-6 flex justify-end">
        <Button onClick={save} disabled={saving}>
          {saving ? t('common.saving') : t('common.save')}
        </Button>
      </div>
    </SectionCard>
  );
}
