import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LanguageToggle } from '../components/LanguageToggle.jsx';
import { defaultDashboardPath } from '@venue-pos/shared';
import { friendlyError } from '../utils/apiError.js';
import { useAuth } from '../hooks/useAuth.js';

export function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const loggedInUser = await login(username, password);
      navigate(defaultDashboardPath(loggedInUser.role));
    } catch (err) {
      setError(friendlyError(err, t('auth.loginFailed')));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen bg-surface-base">
      {/* Brand panel */}
      <aside className="relative hidden flex-1 flex-col justify-between overflow-hidden bg-ink-gradient p-12 text-white lg:flex">
        <div className="absolute inset-0 bg-hero-glow opacity-80" aria-hidden="true" />
        <div
          className="absolute -bottom-24 -end-24 h-80 w-80 rounded-full bg-accent-500/20 blur-3xl"
          aria-hidden="true"
        />
        <div className="relative">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-gradient text-2xl font-bold shadow-elevated">
            {t('app.name')?.slice(0, 1) || 'V'}
          </div>
          <h1 className="mt-8 text-4xl font-bold tracking-tight">{t('app.name')}</h1>
          <p className="mt-4 max-w-sm text-base leading-relaxed text-slate-300">{t('app.tagline')}</p>
        </div>
        <div className="relative space-y-4">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
            <p className="text-sm leading-relaxed text-slate-200">{t('dashboard.heroSubtitle')}</p>
          </div>
          <p className="text-sm text-slate-400">{t('auth.loginSubtitle')}</p>
        </div>
      </aside>

      {/* Form panel */}
      <div className="relative flex flex-1 flex-col items-center justify-center p-6">
        <div className="absolute end-6 top-6">
          <LanguageToggle />
        </div>

        <div className="w-full max-w-md animate-fade-up rounded-3xl border border-slate-200/70 bg-white p-8 shadow-card sm:p-10">
          <div className="mb-8 lg:hidden">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-gradient text-xl font-bold text-white shadow-card">
              {t('app.name')?.slice(0, 1) || 'V'}
            </div>
          </div>

          <h2 className="text-2xl font-bold tracking-tight text-slate-900">{t('auth.login')}</h2>
          <p className="mb-8 mt-1.5 text-sm text-slate-500">{t('auth.loginSubtitle')}</p>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                {t('auth.username')}
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="premium-input"
                autoComplete="username"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                {t('auth.password')}
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="premium-input"
                autoComplete="current-password"
              />
            </div>
            {error && (
              <p className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm font-medium text-red-700">
                {error}
              </p>
            )}
            <button type="submit" disabled={loading} className="btn-accent w-full py-3 text-[0.95rem]">
              {loading ? t('auth.loggingIn') : t('auth.login')}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
