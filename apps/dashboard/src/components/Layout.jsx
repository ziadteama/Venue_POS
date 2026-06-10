import { useEffect, useState, useCallback } from 'react';
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { canAccessDashboardPath, canSeeFinancials, defaultDashboardPath } from '@venue-pos/shared';
import { Sidebar } from './Sidebar.jsx';
import { ErrorBoundary } from './ErrorBoundary.jsx';
import { LanguageToggle } from './LanguageToggle.jsx';
import { BellIcon } from './dashboard/icons.jsx';
import { useAuth } from '../hooks/useAuth.js';
import { useHubNotifications } from '../hooks/useHubNotifications.js';
import { CommandPalette } from './dashboard/CommandPalette.jsx';

const SECTION_TITLES = {
  '/': 'nav.overview',
  '/analytics': 'nav.analytics',
  '/menus': 'nav.menus',
  '/cheques': 'nav.cheques',
  '/shifts': 'nav.shifts',
  '/orders': 'nav.orders',
  '/users': 'nav.users',
  '/settings': 'nav.settings',
  '/activity': 'nav.activity',
  '/health': 'nav.health',
};

function GuardedOutlet() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  if (!canAccessDashboardPath(user?.role, pathname, user)) {
    return <Navigate to={defaultDashboardPath(user?.role)} replace />;
  }
  return <Outlet />;
}

function MenuButton({ onClick, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600 shadow-sm transition hover:bg-slate-50 lg:hidden"
    >
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <path d="M4 7h16M4 12h16M4 17h16" />
      </svg>
    </button>
  );
}

export function Layout() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { logout, token, user } = useAuth();
  const { notice, setNotice } = useHubNotifications(token);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const onKeyDown = useCallback((e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      setCommandOpen(true);
    }
  }, []);

  useEffect(() => {
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onKeyDown]);

  function handleLogout() {
    logout();
    navigate('/login', { replace: true });
  }

  const sectionKey =
    SECTION_TITLES[location.pathname] ??
    Object.entries(SECTION_TITLES).find(
      ([path]) => path !== '/' && location.pathname.startsWith(path),
    )?.[1] ??
    'dashboard.title';

  return (
    <div className="min-h-screen bg-surface-base">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 start-0 z-40 hidden w-[17rem] lg:block">
        <Sidebar onLogout={handleLogout} />
      </aside>

      {/* Mobile sidebar + overlay */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label={t('common.cancel')}
            onClick={() => setMobileOpen(false)}
            className="absolute inset-0 bg-ink-900/50 backdrop-blur-sm animate-fade-in"
          />
          <div className="absolute inset-y-0 start-0 w-[17rem] animate-fade-up shadow-elevated">
            <Sidebar onLogout={handleLogout} onNavigate={() => setMobileOpen(false)} />
          </div>
        </div>
      ) : null}

      <div className="lg:ps-[17rem]">
        <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-surface-base/85 backdrop-blur-md">
          <div className="flex items-center justify-between gap-3 px-4 py-3.5 sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <MenuButton onClick={() => setMobileOpen(true)} label={t('nav.main')} />
              <div className="min-w-0">
                <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
                  {t('dashboard.title')}
                </p>
                <h1 className="truncate text-base font-semibold tracking-tight text-slate-900">
                  {t(sectionKey)}
                </h1>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2 sm:gap-3">
              <button
                type="button"
                onClick={() => setCommandOpen(true)}
                className="hidden rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-500 shadow-sm transition hover:bg-slate-50 sm:inline-flex sm:items-center sm:gap-1"
              >
                <span>{t('commandPalette.shortcut')}</span>
                <kbd className="rounded border border-slate-200 bg-slate-50 px-1 font-mono text-[10px]">
                  Ctrl+K
                </kbd>
              </button>
              <div className="hidden sm:block">
                <LanguageToggle />
              </div>
              <button
                type="button"
                className="relative rounded-lg border border-slate-200 bg-white p-2 text-slate-500 shadow-sm transition hover:bg-slate-50"
                aria-label={t('nav.activity')}
              >
                <BellIcon className="h-5 w-5" />
                {notice ? (
                  <span className="absolute end-2 top-2 h-2 w-2 animate-pulse-ring rounded-full bg-accent-500" />
                ) : null}
              </button>
            </div>
          </div>
        </header>

        {notice ? (
          <div className="mx-4 mt-4 flex items-start justify-between gap-3 rounded-xl border border-accent-200 bg-accent-50 px-4 py-3 text-sm text-accent-800 shadow-card sm:mx-6 lg:mx-8">
            <span className="font-medium">
              {notice.payload.type === 'refund'
                ? canSeeFinancials(user)
                  ? t('dashboard.refundAlert', {
                      number: notice.payload.chequeNumber,
                      amount: Number(notice.payload.amount ?? 0).toFixed(2),
                      currency: t('pos.currency'),
                      cashier: notice.payload.cashierName ?? notice.payload.managerName ?? '—',
                    })
                  : t('dashboard.refundAlertOps', {
                      number: notice.payload.chequeNumber,
                      cashier: notice.payload.cashierName ?? notice.payload.managerName ?? '—',
                    })
                : canSeeFinancials(user)
                  ? t('dashboard.discountAlert', {
                      number: notice.payload.chequeNumber,
                      amount: Number(notice.payload.amount ?? 0).toFixed(2),
                      currency: t('pos.currency'),
                    })
                  : t('dashboard.discountAlertOps', {
                      number: notice.payload.chequeNumber,
                    })}
            </span>
            <button
              type="button"
              onClick={() => setNotice(null)}
              className="shrink-0 rounded-lg border border-accent-300 px-2 py-0.5 text-xs font-semibold text-accent-700 transition hover:bg-accent-100"
            >
              {t('pos.dismissNotification')}
            </button>
          </div>
        ) : null}

        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
          <ErrorBoundary>
            <GuardedOutlet />
          </ErrorBoundary>
        </main>
      </div>

      <CommandPalette open={commandOpen} onClose={() => setCommandOpen(false)} />
    </div>
  );
}
