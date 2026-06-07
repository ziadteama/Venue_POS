import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ROLES } from '@venue-pos/shared';
import { useAuth } from '../hooks/useAuth.js';

const NAV_ITEMS = [
  { to: '/', end: true, labelKey: 'nav.overview', roles: [ROLES.HUB_OWNER] },
  { to: '/analytics', labelKey: 'nav.analytics', roles: [ROLES.HUB_OWNER] },
  { to: '/menus', labelKey: 'nav.menus', roles: [ROLES.HUB_MANAGER] },
  { to: '/cheques', labelKey: 'nav.cheques', roles: [ROLES.HUB_MANAGER] },
  { to: '/shifts', labelKey: 'nav.shifts', roles: [ROLES.HUB_MANAGER] },
  { to: '/orders', labelKey: 'nav.orders', roles: [ROLES.HUB_MANAGER] },
  { to: '/approvals', labelKey: 'nav.approvals', roles: [ROLES.HUB_MANAGER] },
  { to: '/users', labelKey: 'nav.users', roles: [ROLES.HUB_MANAGER] },
  { to: '/settings', labelKey: 'nav.settings', roles: [ROLES.HUB_MANAGER] },
  { to: '/activity', labelKey: 'nav.activity', roles: [ROLES.HUB_MANAGER] },
  { to: '/health', labelKey: 'nav.health', roles: [ROLES.HUB_MANAGER] },
];

function linkClass({ isActive }) {
  return [
    'shrink-0 rounded-lg px-3.5 py-2 text-sm font-medium transition',
    isActive ? 'bg-white text-primary-from shadow-sm' : 'text-white/90 hover:bg-white/15',
  ].join(' ');
}

export function DashboardNav() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const items = NAV_ITEMS.filter((item) => item.roles.includes(user?.role));

  return (
    <nav className="flex gap-1.5 overflow-x-auto pb-1 pt-0.5" aria-label={t('nav.main')}>
      {items.map((item) => (
        <NavLink key={item.to} to={item.to} end={item.end} className={linkClass}>
          {t(item.labelKey)}
        </NavLink>
      ))}
    </nav>
  );
}
