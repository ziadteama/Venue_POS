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
    <div className="flex min-h-screen">
      <aside className="hidden flex-1 flex-col justify-between bg-primary-gradient p-10 text-white lg:flex">
        <div>
          <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15 text-2xl font-bold">
            V
          </div>
          <h1 className="text-3xl font-bold">{t('app.name')}</h1>
          <p className="mt-3 max-w-sm text-white/85">{t('app.tagline')}</p>
        </div>
        <p className="text-sm text-white/60">{t('auth.loginSubtitle')}</p>
      </aside>

      <div className="flex flex-1 flex-col items-center justify-center bg-slate-50 p-6">
        <div className="absolute end-6 top-6">
          <LanguageToggle />
        </div>

        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <div className="mb-6 lg:hidden">
            <h1 className="bg-primary-gradient bg-clip-text text-2xl font-bold text-transparent">
              {t('app.name')}
            </h1>
            <p className="mt-1 text-secondary">{t('app.tagline')}</p>
          </div>

          <h2 className="mb-1 text-xl font-semibold text-slate-900">{t('auth.login')}</h2>
          <p className="mb-6 text-sm text-secondary">{t('auth.loginSubtitle')}</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                {t('auth.username')}
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full rounded-lg border border-secondary/40 bg-slate-50 px-3 py-2.5 focus:border-primary-to focus:outline-none focus:ring-2 focus:ring-primary-to/20"
                autoComplete="username"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                {t('auth.password')}
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-secondary/40 bg-slate-50 px-3 py-2.5 focus:border-primary-to focus:outline-none focus:ring-2 focus:ring-primary-to/20"
                autoComplete="current-password"
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-primary-gradient py-3 font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {loading ? t('auth.loggingIn') : t('auth.login')}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
