import { useState } from 'react';
import { LanguageToggle } from './LanguageToggle.jsx';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clear', '0', 'back'];

export function PinLoginScreen({ t, onLogin, loading, error }) {
  const [pin, setPin] = useState('');

  function appendDigit(digit) {
    if (loading || pin.length >= 6) return;
    setPin((p) => p + digit);
  }

  function handleKey(key) {
    if (key === 'clear') {
      setPin('');
      return;
    }
    if (key === 'back') {
      setPin((p) => p.slice(0, -1));
      return;
    }
    appendDigit(key);
  }

  async function submit(e) {
    e?.preventDefault();
    if (pin.length < 4 || loading) return;
    const ok = await onLogin(pin);
    if (ok) setPin('');
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-100">
      <header className="flex items-center justify-between bg-primary-gradient px-6 py-4 text-white shadow-md">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15 text-lg font-bold">
            V
          </div>
          <div>
            <h1 className="text-lg font-bold">{t('pos.title')}</h1>
            <p className="text-sm text-white/80">{t('pos.pinLoginSubtitle')}</p>
          </div>
        </div>
        <LanguageToggle onDark />
      </header>

      <main className="flex flex-1 items-center justify-center p-6">
        <form
          onSubmit={submit}
          className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-lg"
        >
          <h2 className="text-center text-xl font-semibold text-slate-900">{t('pos.pinLoginTitle')}</h2>
          <p className="mt-1 text-center text-sm text-secondary">{t('pos.pinLoginHint')}</p>

          <div
            className="mt-6 flex justify-center gap-2"
            aria-label={t('pos.pinLoginTitle')}
          >
            {Array.from({ length: 6 }).map((_, i) => (
              <span
                key={i}
                className={`h-3 w-3 rounded-full border-2 ${
                  i < pin.length
                    ? 'border-primary-to bg-primary-to'
                    : 'border-slate-300 bg-transparent'
                }`}
              />
            ))}
          </div>

          {error ? (
            <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-center text-sm text-red-700">
              {error}
            </p>
          ) : null}

          <div className="mt-6 grid grid-cols-3 gap-2">
            {KEYS.map((key) => (
              <button
                key={key}
                type="button"
                disabled={loading}
                onClick={() => handleKey(key)}
                className={`rounded-xl py-4 text-lg font-semibold transition active:scale-95 disabled:opacity-50 ${
                  key === 'clear' || key === 'back'
                    ? 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    : 'bg-slate-50 text-slate-900 ring-1 ring-slate-200 hover:bg-slate-100'
                }`}
              >
                {key === 'clear' ? t('pos.pinClear') : key === 'back' ? '⌫' : key}
              </button>
            ))}
          </div>

          <button
            type="submit"
            disabled={pin.length < 4 || loading}
            className="mt-4 w-full rounded-xl bg-primary-to py-3.5 text-sm font-semibold text-white disabled:opacity-40"
          >
            {loading ? t('common.loading') : t('pos.pinLoginSubmit')}
          </button>
        </form>
      </main>
    </div>
  );
}
