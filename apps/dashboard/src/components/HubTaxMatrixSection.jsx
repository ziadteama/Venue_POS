import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiFetch } from '../api/client.js';
import { friendlyError } from '../utils/apiError.js';
import { SectionCard } from './ui/Card.jsx';
import { Field, Input } from './ui/Field.jsx';
import { Button } from './ui/Button.jsx';
import { RevenueIcon, AlertIcon, CheckCircleIcon } from './dashboard/icons.jsx';

const emptyForm = () => ({
  taxRate: '0',
  taxInclusive: false,
  serviceRate: '0',
  serviceEnabled: false,
});

export function HubTaxMatrixSection() {
  const { t } = useTranslation();
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const config = await apiFetch('/api/v1/manager/hub/billing');
      setForm({
        taxRate: String((config.taxRate ?? 0) * 100),
        taxInclusive: config.taxInclusive,
        serviceRate: String((config.serviceRate ?? 0) * 100),
        serviceEnabled: config.serviceEnabled ?? false,
      });
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const taxPercent = Number(form.taxRate);
      const servicePercent = Number(form.serviceRate);
      await apiFetch('/api/v1/manager/hub/billing', {
        method: 'PATCH',
        body: JSON.stringify({
          taxRate: taxPercent / 100,
          taxInclusive: form.taxInclusive,
          serviceRate: servicePercent / 100,
          serviceEnabled: form.serviceEnabled,
        }),
      });
      setSuccess(t('hubTax.saved'));
      await load();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <SectionCard title={t('hubTax.title')} hint={t('hubTax.hint')} icon={RevenueIcon}>
      {error ? (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <AlertIcon className="h-4 w-4 shrink-0" />
          {error}
        </div>
      ) : null}
      {success ? (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-accent-200 bg-accent-50 px-3 py-2 text-sm text-accent-700">
          <CheckCircleIcon className="h-4 w-4 shrink-0" />
          {success}
        </div>
      ) : null}
      {loading ? (
        <p className="text-sm text-slate-500">{t('common.loading')}</p>
      ) : (
        <form onSubmit={save} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label={t('venueConfig.taxRate')}>
              <Input
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={form.taxRate}
                onChange={(e) => setForm((f) => ({ ...f, taxRate: e.target.value }))}
              />
            </Field>
            <Field label={t('venueConfig.serviceRate')}>
              <Input
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={form.serviceRate}
                disabled={!form.serviceEnabled}
                onChange={(e) => setForm((f) => ({ ...f, serviceRate: e.target.value }))}
              />
            </Field>
            <label className="flex items-center gap-2 self-end pb-2 text-sm text-slate-700">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300 text-accent-600"
                checked={form.taxInclusive}
                onChange={(e) => setForm((f) => ({ ...f, taxInclusive: e.target.checked }))}
              />
              {t('venueConfig.taxInclusive')}
            </label>
            <label className="flex items-center gap-2 self-end pb-2 text-sm text-slate-700">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300 text-accent-600"
                checked={form.serviceEnabled}
                onChange={(e) => setForm((f) => ({ ...f, serviceEnabled: e.target.checked }))}
              />
              {t('venueConfig.serviceEnabled')}
            </label>
          </div>
          <div className="flex justify-end">
            <Button type="submit" variant="primary" size="sm" loading={saving}>
              {t('common.save')}
            </Button>
          </div>
        </form>
      )}
    </SectionCard>
  );
}
