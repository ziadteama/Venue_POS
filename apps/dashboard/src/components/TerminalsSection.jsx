import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiFetch } from '../api/client.js';

export function TerminalsSection({ venueId }) {
  const { t } = useTranslation();
  const [terminals, setTerminals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [savingId, setSavingId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const q = venueId ? `?venueId=${encodeURIComponent(venueId)}` : '';
      const rows = await apiFetch(`/api/v1/manager/terminals${q}`);
      setTerminals(Array.isArray(rows) ? rows : []);
    } catch (err) {
      setError(err?.message || t('terminals.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [venueId, t]);

  useEffect(() => {
    load();
  }, [load]);

  async function setCoordinator(terminal, enabled) {
    setSavingId(terminal.id);
    setError('');
    try {
      await apiFetch(`/api/v1/manager/terminals/${terminal.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isCoordinator: enabled }),
      });
      await load();
    } catch (err) {
      setError(err?.message || t('terminals.saveFailed'));
    } finally {
      setSavingId(null);
    }
  }

  async function saveLanHost(terminal, host) {
    setSavingId(terminal.id);
    setError('');
    try {
      await apiFetch(`/api/v1/manager/terminals/${terminal.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ coordinatorLanHost: host || null }),
      });
      await load();
    } catch (err) {
      setError(err?.message || t('terminals.saveFailed'));
    } finally {
      setSavingId(null);
    }
  }

  if (loading) return <p className="text-sm text-secondary">{t('common.loading')}</p>;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-lg font-semibold">{t('terminals.title')}</h3>
      <p className="mt-1 text-sm text-secondary">{t('terminals.subtitle')}</p>
      {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
      <ul className="mt-4 divide-y divide-slate-100">
        {terminals.map((terminal) => (
          <li key={terminal.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
            <div className="min-w-0 flex-1">
              <p className="font-medium">{terminal.name || terminal.id}</p>
              <p className="text-secondary">
                {terminal.venueNameEn}
                {terminal.isCoordinator ? ` · ${t('terminals.coordinator')}` : ''}
              </p>
            </div>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={terminal.isCoordinator}
                disabled={savingId === terminal.id}
                onChange={(e) => setCoordinator(terminal, e.target.checked)}
              />
              <span>{t('terminals.markCoordinator')}</span>
            </label>
            <input
              type="text"
              className="w-40 rounded border px-2 py-1 text-xs"
              placeholder={t('terminals.lanHostPlaceholder')}
              defaultValue={terminal.coordinatorLanHost ?? ''}
              disabled={savingId === terminal.id}
              onBlur={(e) => {
                if (e.target.value !== (terminal.coordinatorLanHost ?? '')) {
                  saveLanHost(terminal, e.target.value.trim());
                }
              }}
            />
          </li>
        ))}
      </ul>
      {!terminals.length ? <p className="mt-3 text-sm text-secondary">{t('terminals.empty')}</p> : null}
    </section>
  );
}
