import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ROLES, canSeeFinancials, dashboardRoleI18nKey } from '@venue-pos/shared';
import { useAuth } from '../hooks/useAuth.js';
import {
  ActivityIcon,
  AnalyticsIcon,
  ChequeIcon,
  HealthIcon,
  MenuIcon,
  OrdersIcon,
  OverviewIcon,
  SettingsIcon,
  ShiftIcon,
  UsersIcon,
  LogoutIcon,
} from './dashboard/icons.jsx';

const NAV_ITEMS = [
  { to: '/', end: true, labelKey: 'nav.overview', Icon: OverviewIcon, roles: [ROLES.HUB_OWNER, ROLES.HUB_MANAGER] },
  { to: '/analytics', labelKey: 'nav.analytics', Icon: AnalyticsIcon, roles: [ROLES.HUB_OWNER], financials: true },
  { to: '/menus', labelKey: 'nav.menus', Icon: MenuIcon, roles: [ROLES.HUB_MANAGER] },
  { to: '/cheques', labelKey: 'nav.cheques', Icon: ChequeIcon, roles: [ROLES.HUB_MANAGER] },
  { to: '/shifts', labelKey: 'nav.shifts', Icon: ShiftIcon, roles: [ROLES.HUB_MANAGER] },
  { to: '/orders', labelKey: 'nav.orders', Icon: OrdersIcon, roles: [ROLES.HUB_MANAGER] },
  { to: '/users', labelKey: 'nav.users', Icon: UsersIcon, roles: [ROLES.HUB_MANAGER] },
  { to: '/settings', labelKey: 'nav.settings', Icon: SettingsIcon, roles: [ROLES.HUB_MANAGER] },
  { to: '/activity', labelKey: 'nav.activity', Icon: ActivityIcon, roles: [ROLES.HUB_MANAGER] },
  { to: '/health', labelKey: 'nav.health', Icon: HealthIcon, roles: [ROLES.HUB_MANAGER] },
];

function navLinkClass({ isActive }) {
  return [
    'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition duration-200 ease-premium',
    isActive
      ? 'bg-white/10 text-white shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)]'
      : 'text-slate-400 hover:bg-white/5 hover:text-white',
  ].join(' ');
}

export function Sidebar({ onNavigate, onLogout }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const items = NAV_ITEMS.filter(
    (item) => item.roles.includes(user?.role) && (!item.financials || canSeeFinancials(user)),
  );
  const initials = (user?.username ?? '?').slice(0, 2).toUpperCase();

  return (
    <div className="flex h-full flex-col bg-ink-gradient">
      <div className="flex items-center gap-3 px-5 pb-6 pt-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-gradient text-base font-bold text-white shadow-card">
          {t('app.name')?.slice(0, 1) || 'V'}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">{t('app.name')}</p>
          <p className="truncate text-xs text-slate-400">{t('dashboard.title')}</p>
        </div>
      </div>

      <nav className="scrollbar-slim flex-1 space-y-1 overflow-y-auto px-3" aria-label={t('nav.main')}>
        {items.map(({ to, end, labelKey, Icon }) => (
          <NavLink key={to} to={to} end={end} onClick={onNavigate} className={navLinkClass}>
            {({ isActive }) => (
              <>
                <span
                  className={`absolute inset-y-1.5 start-0 w-1 rounded-full bg-accent-400 transition-opacity duration-200 ${
                    isActive ? 'opacity-100' : 'opacity-0'
                  }`}
                />
                <Icon
                  className={`h-5 w-5 shrink-0 transition ${
                    isActive ? 'text-accent-400' : 'text-slate-400 group-hover:text-white'
                  }`}
                />
                <span className="truncate">{t(labelKey)}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-surface-sidebar-line/70 p-3">
        <div className="flex items-center gap-3 rounded-xl px-2 py-2">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/10 text-xs font-semibold text-white">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-white">{user?.username}</p>
            {user?.role ? (
              <p className="truncate text-xs text-slate-400">{t(dashboardRoleI18nKey(user.role))}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onLogout}
            title={t('nav.logout')}
            aria-label={t('nav.logout')}
            className="rounded-lg p-2 text-slate-400 transition hover:bg-white/10 hover:text-white"
          >
            <LogoutIcon className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
