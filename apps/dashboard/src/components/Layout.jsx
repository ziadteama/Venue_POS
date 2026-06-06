import { Link, Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LanguageToggle } from './LanguageToggle.jsx';
import { useAuth } from '../hooks/useAuth.js';

export function Layout() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b border-slate-200 bg-primary-gradient px-6 py-4 text-white">
        <div>
          <h1 className="text-lg font-semibold">{t('dashboard.title')}</h1>
          <p className="text-sm text-white/80">{t('dashboard.welcome', { name: user?.username })}</p>
        </div>
        <div className="flex items-center gap-4">
          <LanguageToggle onDark />
          <button
            type="button"
            onClick={logout}
            className="rounded-lg border border-white/30 bg-white/10 px-3 py-2 text-sm hover:bg-white/20"
          >
            {t('nav.logout')}
          </button>
        </div>
      </header>
      <nav className="flex gap-4 border-b border-slate-200 bg-white px-6 py-2 text-sm">
        <Link to="/" className="text-secondary hover:text-primary-from">
          {t('dashboard.title')}
        </Link>
        <Link to="/menus" className="text-secondary hover:text-primary-from">
          {t('menu.title')}
        </Link>
      </nav>
      <main className="p-6">
        <Outlet />
      </main>
    </div>
  );
}
