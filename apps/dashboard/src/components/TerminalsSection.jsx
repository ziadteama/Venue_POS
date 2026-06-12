import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiFetch } from '../api/client.js';
import { friendlyError } from '../utils/apiError.js';
import { StatusBadge } from './ui/Badge.jsx';

function ManagerPinModal({ terminal, open, onClose, onSave, saving }) {
  const { t } = useTranslation();
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [localError, setLocalError] = useState('');

  useEffect(() => {
    if (open) {
      setPin('');
      setConfirm('');
      setLocalError('');
    }
  }, [open]);

  if (!open) return null;

  function submit(e) {
    e.preventDefault();
    if (pin.length < 4 || pin.length > 8) {
      setLocalError(t('terminals.managerPinInvalid'));
      return;
    }
    if (pin !== confirm) {
      setLocalError(t('terminals.managerPinMismatch'));
      return;
    }
    setLocalError('');
    onSave(pin);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <form
        onSubmit={submit}
        className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
      >
        <h4 className="text-base font-semibold text-slate-900">{t('terminals.changeManagerPin')}</h4>
        <p className="mt-1 text-sm text-slate-500">
          {t('terminals.changeManagerPinSubtitle', { name: terminal.name ?? terminal.id })}
        </p>
        <label className="mt-4 block text-sm font-medium text-slate-700">
          {t('terminals.managerPinNew')}
          <input
            type="password"
            inputMode="numeric"
            maxLength={8}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            className="premium-input mt-1 w-full"
            autoFocus
          />
        </label>
        <label className="mt-3 block text-sm font-medium text-slate-700">
          {t('terminals.managerPinConfirm')}
          <input
            type="password"
            inputMode="numeric"
            maxLength={8}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value.replace(/\D/g, ''))}
            className="premium-input mt-1 w-full"
          />
        </label>
        {localError ? (
          <p className="mt-3 text-sm text-red-600">{localError}</p>
        ) : null}
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-secondary px-4 py-2 text-sm">
            {t('common.cancel')}
          </button>
          <button type="submit" disabled={saving} className="btn-accent px-4 py-2 text-sm disabled:opacity-50">
            {saving ? t('common.loading') : t('common.save')}
          </button>
        </div>
      </form>
    </div>
  );
}

export function TerminalsSection({ venueId }) {
  const { t } = useTranslation();
  const [terminals, setTerminals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [savingId, setSavingId] = useState(null);
  const [pinModalTerminal, setPinModalTerminal] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const q = venueId ? `?venueId=${encodeURIComponent(venueId)}` : '';
      const rows = await apiFetch(`/api/v1/manager/terminals${q}`);
      setTerminals(Array.isArray(rows) ? rows : []);
    } catch (err) {
      setError(friendlyError(err, t('terminals.loadFailed')));
    } finally {
      setLoading(false);
    }
  }, [venueId, t]);

  useEffect(() => {
    load();
  }, [load]);

  async function patchTerminal(terminal, body) {
    setSavingId(terminal.id);
    setError('');
    try {
      await apiFetch(`/api/v1/manager/terminals/${terminal.id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      await load();
    } catch (err) {
      setError(friendlyError(err, t('terminals.saveFailed')));
    } finally {
      setSavingId(null);
    }
  }

  async function setCoordinator(terminal, enabled) {
    await patchTerminal(terminal, { isCoordinator: enabled });
  }

  async function saveAssignedLanHost(terminal, host) {
    await patchTerminal(terminal, { assignedLanHost: host || null });
  }

  async function saveCoordinatorLanHost(terminal, host) {
    await patchTerminal(terminal, { coordinatorLanHost: host || null });
  }

  async function saveName(terminal, name) {
    const trimmed = name.trim();
    if (!trimmed || trimmed === (terminal.name ?? '')) return;
    await patchTerminal(terminal, { name: trimmed });
  }

  async function saveManagerPin(terminal, kioskExitPin) {
    await patchTerminal(terminal, { kioskExitPin });
    setPinModalTerminal(null);
  }

  function statusLabel(status) {
    if (status === 'pending') return t('terminals.status.pending');
    if (status === 'online') return t('terminals.status.online');
    return t('terminals.status.offline');
  }

  return (
    <section className="surface-card overflow-hidden">
      <div className="border-b border-slate-100 px-6 py-4">
        <h3 className="text-sm font-semibold text-slate-900">{t('terminals.title')}</h3>
        <p className="mt-0.5 text-xs text-slate-500">{t('terminals.subtitle')}</p>
      </div>
      <div className="px-6 py-5">
        {error ? (
          <p className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm font-medium text-red-700">
            {error}
          </p>
        ) : null}
        {loading ? (
          <p className="text-sm text-slate-500">{t('common.loading')}</p>
        ) : (
          <>
            <ul className="divide-y divide-slate-100">
              {terminals.map((terminal) => (
                <li
                  key={terminal.id}
                  className="grid gap-3 py-4 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto] sm:items-start"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="text"
                        className="premium-input max-w-xs py-1.5 font-medium"
                        placeholder={t('terminals.deviceNamePlaceholder')}
                        defaultValue={terminal.name ?? ''}
                        disabled={savingId === terminal.id}
                        onBlur={(e) => saveName(terminal, e.target.value)}
                      />
                      <StatusBadge status={terminal.status ?? 'pending'} label={statusLabel(terminal.status)} />
                    </div>
                    <p className="mt-1 font-mono text-xs text-slate-500">{terminal.id}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {terminal.venueNameEn}
                      {terminal.isCoordinator ? ` · ${t('terminals.coordinator')}` : ''}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className="text-xs font-medium text-slate-600">{t('terminals.managerPin')}</span>
                      <button
                        type="button"
                        className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                        disabled={savingId === terminal.id}
                        onClick={() => setPinModalTerminal(terminal)}
                      >
                        {t('terminals.changeManagerPin')}
                      </button>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-400">{t('terminals.managerPinHint')}</p>
                    {terminal.lastLanHost ? (
                      <p className="mt-1 text-xs text-slate-400">
                        {t('terminals.reportedLan', {
                          host: terminal.lastLanHost,
                          port: terminal.lastLanPort ?? '—',
                          mode: terminal.lastClusterMode ?? '—',
                        })}
                      </p>
                    ) : (
                      <p className="mt-1 text-xs text-slate-400">{t('terminals.notReportedYet')}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <label className="block text-xs font-medium text-slate-600">
                      {t('terminals.assignedLanLabel')}
                      <input
                        type="text"
                        inputMode="decimal"
                        className="premium-input mt-1 w-full py-1.5 text-xs"
                        placeholder={t('terminals.assignedLanPlaceholder')}
                        defaultValue={terminal.assignedLanHost ?? ''}
                        disabled={savingId === terminal.id}
                        onBlur={(e) => {
                          const next = e.target.value.trim();
                          if (next !== (terminal.assignedLanHost ?? '')) {
                            saveAssignedLanHost(terminal, next);
                          }
                        }}
                      />
                    </label>
                    {terminal.isCoordinator ? (
                      <label className="block text-xs font-medium text-slate-600">
                        {t('terminals.coordinatorLanLabel')}
                        <input
                          type="text"
                          inputMode="decimal"
                          className="premium-input mt-1 w-full py-1.5 text-xs"
                          placeholder={t('terminals.coordinatorLanPlaceholder')}
                          defaultValue={terminal.coordinatorLanHost ?? ''}
                          disabled={savingId === terminal.id}
                          onBlur={(e) => {
                            const next = e.target.value.trim();
                            if (next !== (terminal.coordinatorLanHost ?? '')) {
                              saveCoordinatorLanHost(terminal, next);
                            }
                          }}
                        />
                      </label>
                    ) : null}
                  </div>

                  <label className="flex items-center gap-2 self-start pt-1 text-sm text-slate-700 sm:justify-end">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-300 text-accent-600 focus:ring-accent-500/30"
                      checked={terminal.isCoordinator}
                      disabled={savingId === terminal.id}
                      onChange={(e) => setCoordinator(terminal, e.target.checked)}
                    />
                    <span>{t('terminals.markCoordinator')}</span>
                  </label>
                </li>
              ))}
            </ul>
            {!terminals.length ? <p className="text-sm text-slate-500">{t('terminals.empty')}</p> : null}
          </>
        )}
      </div>
      <ManagerPinModal
        terminal={pinModalTerminal ?? { id: '', name: '' }}
        open={Boolean(pinModalTerminal)}
        onClose={() => setPinModalTerminal(null)}
        onSave={(pin) => pinModalTerminal && saveManagerPin(pinModalTerminal, pin)}
        saving={Boolean(pinModalTerminal && savingId === pinModalTerminal.id)}
      />
    </section>
  );
}
