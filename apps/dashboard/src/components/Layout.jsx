import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { canAccessDashboardPath, dashboardRoleI18nKey, defaultDashboardPath } from '@venue-pos/shared';
import { DashboardNav } from './DashboardNav.jsx';
import { LanguageToggle } from './LanguageToggle.jsx';
import { useAuth } from '../hooks/useAuth.js';

function GuardedOutlet() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  if (!canAccessDashboardPath(user?.role, pathname)) {
    return <Navigate to={defaultDashboardPath(user?.role)} replace />;
  }
  return <Outlet />;
}

export function Layout() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  function handleLogout() {
    logout();
    navigate('/login', { replace: true });
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-primary-gradient text-white shadow-md">
        <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4">
          <div className="min-w-0">
            <h1 className="text-lg font-bold tracking-tight">{t('dashboard.title')}</h1>
            <p className="truncate text-sm text-white/80">
              {t('dashboard.welcome', { name: user?.username })}
              {user?.role ? (
                <span className="ms-2 rounded-md bg-white/15 px-2 py-0.5 text-xs font-medium">
                  {t(dashboardRoleI18nKey(user.role))}
                </span>
              ) : null}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <LanguageToggle onDark />
            <button
              type="button"
              onClick={handleLogout}
              className="shrink-0 rounded-lg border border-white/30 bg-white/10 px-3 py-2 text-sm font-medium hover:bg-white/20 active:bg-white/25"
            >
              {t('nav.logout')}
            </button>
          </div>
        </div>
        <div className="border-t border-white/15 px-4 pb-3 pt-2 sm:px-6">
          <DashboardNav />
        </div>
      </header>
      <main className="mx-auto max-w-7xl p-4 sm:p-6">
        <GuardedOutlet />
      </main>
    </div>
  );
}
