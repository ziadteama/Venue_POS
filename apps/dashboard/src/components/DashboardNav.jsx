import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../hooks/useAuth.js';

const NAV_ITEMS = [
  { to: '/', end: true, labelKey: 'nav.overview', roles: ['hub_manager', 'venue_manager'] },
  { to: '/analytics', labelKey: 'nav.analytics', roles: ['hub_manager', 'venue_manager'] },
  { to: '/cheques', labelKey: 'nav.cheques', roles: ['hub_manager', 'venue_manager'] },
  { to: '/shifts', labelKey: 'nav.shifts', roles: ['hub_manager', 'venue_manager'] },
  { to: '/users', labelKey: 'nav.users', roles: ['venue_manager'] },
  { to: '/orders', labelKey: 'nav.orders', roles: ['hub_manager'] },
  { to: '/menus', labelKey: 'nav.menus', roles: ['hub_manager'] },
  { to: '/activity', labelKey: 'nav.activity', roles: ['hub_manager'] },
  { to: '/health', labelKey: 'nav.health', roles: ['hub_manager', 'venue_manager'] },
  { to: '/settings', labelKey: 'nav.settings', roles: ['hub_manager'] },
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
