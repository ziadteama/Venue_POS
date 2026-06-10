import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiFetch } from '../api/client.js';
import { friendlyError } from '../utils/apiError.js';
import { SectionCard } from './ui/Card.jsx';
import { Field, Input } from './ui/Field.jsx';
import { Button } from './ui/Button.jsx';
import { RevenueIcon, AlertIcon, CheckCircleIcon } from './dashboard/icons.jsx';

function labelEntity(row, language) {
  return language === 'ar' ? row.nameAr || row.nameEn : row.nameEn;
}

export function HubTaxMatrixSection() {
  const { t, i18n } = useTranslation();
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const venues = await apiFetch('/api/v1/venues');
      const configs = await Promise.all(
        venues.map(async (v) => {
          const config = await apiFetch(`/api/v1/manager/venues/${v.id}/config`);
          return {
            id: v.id,
            nameEn: v.nameEn,
            nameAr: v.nameAr,
            taxRate: String((config.taxRate ?? 0) * 100),
            taxInclusive: config.taxInclusive,
            serviceRate: String((config.serviceRate ?? 0) * 100),
            serviceEnabled: config.serviceEnabled ?? false,
          };
        }),
      );
      setRows(configs);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function updateRow(id, patch) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  async function saveRow(row) {
    setSavingId(row.id);
    setError('');
    setSuccess('');
    try {
      const taxPercent = Number(row.taxRate);
      const servicePercent = Number(row.serviceRate);
      await apiFetch(`/api/v1/manager/venues/${row.id}/config`, {
        method: 'PATCH',
        body: JSON.stringify({
          taxRate: taxPercent / 100,
          taxInclusive: row.taxInclusive,
          serviceRate: servicePercent / 100,
          serviceEnabled: row.serviceEnabled,
        }),
      });
      setSuccess(t('hubTax.saved', { venue: labelEntity(row, i18n.language) }));
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setSavingId('');
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
        <div className="space-y-4">
          {rows.map((row) => (
            <div
              key={row.id}
              className="rounded-xl border border-slate-200 bg-surface-overlay p-4"
            >
              <h4 className="mb-3 text-sm font-semibold text-slate-900">
                {labelEntity(row, i18n.language)}
              </h4>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Field label={t('venueConfig.taxRate')}>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={row.taxRate}
                    onChange={(e) => updateRow(row.id, { taxRate: e.target.value })}
                  />
                </Field>
                <Field label={t('venueConfig.serviceRate')}>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={row.serviceRate}
                    disabled={!row.serviceEnabled}
                    onChange={(e) => updateRow(row.id, { serviceRate: e.target.value })}
                  />
                </Field>
                <label className="flex items-center gap-2 self-end pb-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-slate-300 text-accent-600"
                    checked={row.taxInclusive}
                    onChange={(e) => updateRow(row.id, { taxInclusive: e.target.checked })}
                  />
                  {t('venueConfig.taxInclusive')}
                </label>
                <label className="flex items-center gap-2 self-end pb-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-slate-300 text-accent-600"
                    checked={row.serviceEnabled}
                    onChange={(e) => updateRow(row.id, { serviceEnabled: e.target.checked })}
                  />
                  {t('venueConfig.serviceEnabled')}
                </label>
              </div>
              <div className="mt-3 flex justify-end">
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  loading={savingId === row.id}
                  onClick={() => saveRow(row)}
                >
                  {t('common.save')}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}
