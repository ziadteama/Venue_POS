import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiFetch } from '../api/client.js';
import { friendlyError } from '../utils/apiError.js';
import { SectionCard } from './ui/Card.jsx';
import { Field, Input } from './ui/Field.jsx';
import { Button } from './ui/Button.jsx';
import { TablesIcon, AlertIcon } from './dashboard/icons.jsx';

export function HubTablesSection() {
  const { t } = useTranslation();
  const [tables, setTables] = useState([]);
  const [newLabel, setNewLabel] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const rows = await apiFetch('/api/v1/manager/hub/tables');
      setTables(rows);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function addTable(e) {
    e.preventDefault();
    const label = newLabel.trim();
    if (!label) return;
    setBusy(true);
    setError('');
    try {
      await apiFetch('/api/v1/manager/hub/tables', {
        method: 'POST',
        body: JSON.stringify({ tableLabel: label, sortOrder: tables.length }),
      });
      setNewLabel('');
      await load();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(row) {
    setBusy(true);
    setError('');
    try {
      await apiFetch(`/api/v1/manager/hub/tables/${row.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !row.isActive }),
      });
      await load();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  async function removeTable(row) {
    if (!window.confirm(t('hubTables.confirmDelete', { label: row.tableLabel }))) return;
    setBusy(true);
    setError('');
    try {
      await apiFetch(`/api/v1/manager/hub/tables/${row.id}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SectionCard title={t('hubTables.title')} hint={t('hubTables.hint')} icon={TablesIcon}>
      {error ? (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <AlertIcon className="h-4 w-4 shrink-0" />
          {error}
        </div>
      ) : null}
      <form onSubmit={addTable} className="mb-4 flex flex-wrap items-end gap-3">
        <Field label={t('hubTables.newLabel')} className="min-w-[12rem] flex-1">
          <Input
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder={t('hubTables.newPlaceholder')}
            maxLength={50}
          />
        </Field>
        <Button type="submit" variant="primary" loading={busy} disabled={!newLabel.trim()}>
          {t('hubTables.add')}
        </Button>
      </form>
      {loading ? (
        <p className="text-sm text-slate-500">{t('common.loading')}</p>
      ) : tables.length === 0 ? (
        <p className="text-sm text-slate-500">{t('hubTables.empty')}</p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
          {tables.map((row) => (
            <li
              key={row.id}
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm"
            >
              <div>
                <span className="font-medium text-slate-900">{row.tableLabel}</span>
                {row.isOccupied ? (
                  <span className="ms-2 text-xs text-amber-700">{t('hubTables.occupied')}</span>
                ) : null}
                {!row.isActive ? (
                  <span className="ms-2 text-xs text-slate-400">{t('hubTables.inactive')}</span>
                ) : null}
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={busy || row.isOccupied}
                  onClick={() => toggleActive(row)}
                >
                  {row.isActive ? t('hubTables.deactivate') : t('hubTables.activate')}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={busy || row.isOccupied}
                  onClick={() => removeTable(row)}
                >
                  {t('common.delete')}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
