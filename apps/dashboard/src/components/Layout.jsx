import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { canAccessDashboardPath, dashboardRoleI18nKey, defaultDashboardPath } from '@venue-pos/shared';
import { DashboardNav } from './DashboardNav.jsx';
import { ErrorBoundary } from './ErrorBoundary.jsx';
import { LanguageToggle } from './LanguageToggle.jsx';
import { useAuth } from '../hooks/useAuth.js';
import { useHubNotifications } from '../hooks/useHubNotifications.js';

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
  const { user, logout, token } = useAuth();
  const { notice, setNotice } = useHubNotifications(token);

  function handleLogout() {
    logout();
    navigate('/login', { replace: true });
  }

  return (
    <div className="min-h-screen bg-slate-100/80">
      <header className="border-b border-slate-200 bg-white text-slate-900 shadow-sm">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold tracking-tight text-slate-900">
              {t('dashboard.title')}
            </h1>
            <p className="truncate text-sm text-slate-500">
              {t('dashboard.welcome', { name: user?.username })}
              {user?.role ? (
                <span className="ms-2 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
                  {t(dashboardRoleI18nKey(user.role))}
                </span>
              ) : null}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <LanguageToggle />
            <button
              type="button"
              onClick={handleLogout}
              className="shrink-0 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              {t('nav.logout')}
            </button>
          </div>
        </div>
        <div className="border-t border-slate-100 bg-slate-50/80">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <DashboardNav />
          </div>
        </div>
      </header>
      {notice ? (
        <div className="border-b border-blue-200 bg-blue-50 px-4 py-2 text-center text-sm text-blue-900 sm:px-6">
          <span>
            {notice.payload.type === 'refund'
              ? t('dashboard.refundAlert', {
                  number: notice.payload.chequeNumber,
                  amount: Number(notice.payload.amount ?? 0).toFixed(2),
                  currency: t('pos.currency'),
                  cashier: notice.payload.cashierName ?? notice.payload.managerName ?? '—',
                })
              : t('dashboard.discountAlert', {
                  number: notice.payload.chequeNumber,
                  amount: Number(notice.payload.amount ?? 0).toFixed(2),
                  currency: t('pos.currency'),
                })}
          </span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="ms-3 rounded border border-blue-300 px-2 py-0.5 text-xs font-medium hover:bg-blue-100"
          >
            {t('pos.dismissNotification')}
          </button>
        </div>
      ) : null}
      <main className="mx-auto max-w-6xl p-4 sm:p-6">
        <ErrorBoundary>
          <GuardedOutlet />
        </ErrorBoundary>
      </main>
    </div>
  );
}
