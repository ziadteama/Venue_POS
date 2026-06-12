import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { callAgent } from '../api/agent.js';

export function SetupReentryGate({ onCancel, onApproved, onBypass }) {
  const { t } = useTranslation();
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [allowBypass, setAllowBypass] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const health = await callAgent('/health');
        if (!cancelled) {
          setAllowBypass(!health?.hasManagerCache);
        }
      } catch {
        if (!cancelled) setAllowBypass(true);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function submit(e) {
    e.preventDefault();
    if (pin.length < 4) return;
    setLoading(true);
    setError('');
    try {
      await callAgent('/v1/auth/verify-manager-pin', {
        method: 'POST',
        body: JSON.stringify({ pin }),
      });
      onApproved();
    } catch {
      setError(t('setup.reentryInvalidPin'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 p-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-xl border border-slate-700 bg-slate-900 p-6 text-white shadow-xl"
      >
        <h2 className="text-lg font-semibold">{t('setup.reentryTitle')}</h2>
        <p className="mt-1 text-sm text-slate-400">{t('setup.reentrySubtitle')}</p>
        <label className="mt-4 block text-sm text-slate-300">{t('pos.floorManagerPin')}</label>
        <input
          type="password"
          inputMode="numeric"
          autoComplete="off"
          maxLength={8}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
          className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-center text-lg tracking-widest"
          autoFocus
        />
        {error ? <p className="mt-2 text-sm text-red-400">{error}</p> : null}
        {allowBypass ? (
          <button
            type="button"
            onClick={() => onBypass?.()}
            className="mt-4 w-full rounded-lg border border-amber-600/60 px-4 py-2 text-sm text-amber-200 hover:bg-amber-950/40"
          >
            {t('setup.openSetupNoPin')}
          </button>
        ) : null}
        <div className="mt-6 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-300"
          >
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            disabled={pin.length < 4 || loading}
            className="flex-1 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            {loading ? t('common.loading') : t('common.next')}
          </button>
        </div>
      </form>
    </div>
  );
}
