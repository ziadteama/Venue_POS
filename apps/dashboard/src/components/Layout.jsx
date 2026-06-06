import { Link, Outlet } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LanguageToggle } from './LanguageToggle.jsx';
import { useAuth } from '../hooks/useAuth.js';
import { apiFetch } from '../api/client.js';

export function Layout() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    if (user?.role !== 'hub_manager') return;
    let cancelled = false;
    async function refresh() {
      try {
        const q = user.venueId ? `?venueId=${user.venueId}` : '';
        const data = await apiFetch(`/api/v1/manager/approval-requests/count${q}`);
        if (!cancelled) setPendingCount(data.count ?? 0);
      } catch {
        if (!cancelled) setPendingCount(0);
      }
    }
    refresh();
    const timer = setInterval(refresh, 10000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [user?.role, user?.venueId]);

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
        <Link to="/cheques" className="text-secondary hover:text-primary-from">
          {t('cheque.title')}
        </Link>
        {user?.role === 'hub_manager' && (
          <Link to="/approvals" className="text-secondary hover:text-primary-from">
            {t('approval.title')}
            {pendingCount > 0 ? ` (${pendingCount})` : ''}
          </Link>
        )}
      </nav>
      <main className="p-6">
        <Outlet />
      </main>
    </div>
  );
}
