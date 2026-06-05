import { Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LanguageToggle } from './LanguageToggle.jsx';
import { useAuth } from '../hooks/useAuth.js';

export function Layout() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
        <div>
          <h1 className="text-lg font-semibold">{t('dashboard.title')}</h1>
          <p className="text-sm text-slate-500">{t('dashboard.welcome', { name: user?.username })}</p>
        </div>
        <div className="flex items-center gap-4">
          <LanguageToggle />
          <button
            type="button"
            onClick={logout}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50"
          >
            {t('nav.logout')}
          </button>
        </div>
      </header>
      <main className="p-6">
        <Outlet />
      </main>
    </div>
  );
}
