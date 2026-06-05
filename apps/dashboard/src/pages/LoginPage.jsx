import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LanguageToggle } from '../components/LanguageToggle.jsx';
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
      await login(username, password);
      navigate('/');
    } catch (err) {
      setError(err.message || t('auth.loginFailed'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-6">
      <div className="absolute end-6 top-6">
        <LanguageToggle />
      </div>
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="mb-2 text-2xl font-bold">{t('app.name')}</h1>
        <p className="mb-6 text-slate-500">{t('app.tagline')}</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium">{t('auth.username')}</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
              autoComplete="username"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">{t('auth.password')}</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
              autoComplete="current-password"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-blue-600 py-3 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? t('auth.loggingIn') : t('auth.login')}
          </button>
        </form>
      </div>
    </div>
  );
}
