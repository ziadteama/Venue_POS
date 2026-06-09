import { useCallback, useEffect, useRef, useState } from 'react';
import { LanguageToggle } from './LanguageToggle.jsx';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clear', '0', 'back'];
const MAX_PIN = 6;

export function PinLoginScreen({ t, onLogin, loading, error }) {
  const [pin, setPin] = useState('');
  const inputRef = useRef(null);

  const appendDigit = useCallback(
    (digit) => {
      if (loading) return;
      setPin((p) => (p.length >= MAX_PIN ? p : p + digit));
    },
    [loading],
  );

  const handleKey = useCallback(
    (key) => {
      if (key === 'clear') {
        setPin('');
        return;
      }
      if (key === 'back') {
        setPin((p) => p.slice(0, -1));
        return;
      }
      appendDigit(key);
    },
    [appendDigit],
  );

  const submit = useCallback(
    async (e) => {
      e?.preventDefault();
      if (pin.length < 4 || loading) return;
      const ok = await onLogin(pin);
      if (ok) setPin('');
    },
    [pin, loading, onLogin],
  );

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKeyDown(e) {
      if (loading) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault();
        appendDigit(e.key);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        setPin((p) => p.slice(0, -1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (pin.length >= 4) submit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setPin('');
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [appendDigit, loading, pin.length, submit]);

  function handleInputChange(e) {
    const digits = e.target.value.replace(/\D/g, '').slice(0, MAX_PIN);
    setPin(digits);
  }

  return (
    <div className="flex min-h-screen flex-col bg-surface-base">
      <header className="flex items-center justify-between border-b border-white/5 bg-ink-gradient px-6 py-4 text-white shadow-card">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent-gradient text-lg font-bold shadow-card">
            {t('pos.title')?.slice(0, 1) || 'V'}
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight">{t('pos.title')}</h1>
            <p className="text-sm text-slate-300">{t('pos.pinLoginSubtitle')}</p>
          </div>
        </div>
        <LanguageToggle onDark />
      </header>

      <main className="relative flex flex-1 items-center justify-center p-6">
        <div className="pointer-events-none absolute inset-0 bg-hero-glow" aria-hidden="true" />
        <form
          onSubmit={submit}
          className="relative w-full max-w-sm animate-fade-up rounded-3xl border border-slate-200/70 bg-white p-7 shadow-elevated"
        >
          <h2 className="text-center text-xl font-bold tracking-tight text-slate-900">{t('pos.pinLoginTitle')}</h2>
          <p className="mt-1 text-center text-sm text-slate-500">{t('pos.pinLoginHint')}</p>

          <label className="mt-6 block">
            <span className="sr-only">{t('pos.pinLoginTitle')}</span>
            <input
              ref={inputRef}
              type="password"
              inputMode="numeric"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              maxLength={MAX_PIN}
              value={pin}
              onChange={handleInputChange}
              disabled={loading}
              placeholder="PIN"
              className="w-full rounded-2xl border border-slate-200 bg-surface-sunken px-4 py-3.5 text-center text-2xl font-semibold tracking-[0.4em] text-slate-900 placeholder:tracking-normal placeholder:text-slate-400 focus:border-accent-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-accent-500/15 disabled:opacity-50"
              aria-label={t('pos.pinLoginTitle')}
            />
          </label>
          <p className="mt-2 text-center text-xs text-slate-400">{t('pos.pinKeyboardHint')}</p>

          <div
            className="mt-4 flex justify-center gap-2"
            aria-hidden="true"
          >
            {Array.from({ length: MAX_PIN }).map((_, i) => (
              <span
                key={i}
                className={`h-2.5 w-2.5 rounded-full transition-colors ${
                  i < pin.length ? 'bg-accent-500' : 'bg-slate-200'
                }`}
              />
            ))}
          </div>

          {error ? (
            <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-center text-sm font-medium text-red-700">
              {error}
            </p>
          ) : null}

          <div className="mt-5 grid grid-cols-3 gap-2.5">
            {KEYS.map((key) => (
              <button
                key={key}
                type="button"
                disabled={loading}
                onClick={() => handleKey(key)}
                className={`rounded-2xl py-3.5 text-lg font-semibold transition duration-150 ease-premium active:scale-95 disabled:opacity-50 ${
                  key === 'clear' || key === 'back'
                    ? 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    : 'border border-slate-200 bg-white text-slate-900 shadow-sm hover:border-accent-200 hover:bg-accent-50/40'
                }`}
              >
                {key === 'clear' ? t('pos.pinClear') : key === 'back' ? 'Del' : key}
              </button>
            ))}
          </div>

          <button
            type="submit"
            disabled={pin.length < 4 || loading}
            className="btn-accent mt-5 w-full py-3.5 text-base disabled:opacity-40"
          >
            {loading ? t('common.loading') : t('pos.pinLoginSubmit')}
          </button>
        </form>
      </main>
    </div>
  );
}
