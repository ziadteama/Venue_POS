import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiFetch } from '../api/client.js';

/**
 * Cross-venue billing matrix for an anchor venue. The hub manager toggles which
 * target venues the anchor terminal may settle on a combined cross-venue cheque.
 */
export function BillingMatrixSection({ anchorVenueId, anchorType }) {
  const { t, i18n } = useTranslation();
  const [matrix, setMatrix] = useState({ venues: [], pairs: [] });
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await apiFetch('/api/v1/manager/billing-config');
      setMatrix(data ?? { venues: [], pairs: [] });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (anchorType !== 'anchor') {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="mb-2 text-lg font-semibold">{t('billing.title')}</h3>
        <p className="text-sm text-secondary">{t('billing.anchorOnly')}</p>
      </section>
    );
  }

  const targets = matrix.venues.filter((v) => v.id !== anchorVenueId);
  const enabledSet = new Set(
    matrix.pairs
      .filter((p) => p.anchorVenueId === anchorVenueId && p.enabled)
      .map((p) => p.targetVenueId),
  );

  async function toggle(targetVenueId, enabled) {
    setBusyId(targetVenueId);
    setError('');
    try {
      await apiFetch('/api/v1/manager/billing-config', {
        method: 'PUT',
        body: JSON.stringify({ anchorVenueId, targetVenueId, enabled }),
      });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId('');
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="mb-1 text-lg font-semibold">{t('billing.title')}</h3>
      <p className="mb-4 text-sm text-secondary">{t('billing.subtitle')}</p>

      {error ? (
        <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="text-sm text-secondary">{t('common.loading')}</p>
      ) : targets.length === 0 ? (
        <p className="text-sm text-secondary">{t('billing.noOtherVenues')}</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {targets.map((venue) => {
            const enabled = enabledSet.has(venue.id);
            return (
              <li key={venue.id} className="flex items-center justify-between py-3">
                <span className="text-sm font-medium text-slate-800">
                  {i18n.language === 'ar' ? venue.nameAr || venue.nameEn : venue.nameEn}
                </span>
                <button
                  type="button"
                  disabled={busyId === venue.id}
                  onClick={() => toggle(venue.id, !enabled)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition disabled:opacity-50 ${
                    enabled ? 'bg-primary-to' : 'bg-slate-300'
                  }`}
                  aria-pressed={enabled}
                  title={enabled ? t('billing.enabled') : t('billing.disabled')}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                      enabled ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
