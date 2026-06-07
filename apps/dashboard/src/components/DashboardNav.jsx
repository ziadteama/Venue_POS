import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

const NAV_ITEMS = [
  { to: '/', end: true, labelKey: 'nav.overview' },
  { to: '/analytics', labelKey: 'nav.analytics' },
  { to: '/cheques', labelKey: 'nav.cheques' },
  { to: '/shifts', labelKey: 'nav.shifts' },
  { to: '/users', labelKey: 'nav.users' },
  { to: '/orders', labelKey: 'nav.orders' },
  { to: '/menus', labelKey: 'nav.menus' },
  { to: '/activity', labelKey: 'nav.activity' },
  { to: '/health', labelKey: 'nav.health' },
  { to: '/settings', labelKey: 'nav.settings' },
];

function linkClass({ isActive }) {
  return [
    'shrink-0 rounded-lg px-3.5 py-2 text-sm font-medium transition',
    isActive ? 'bg-white text-primary-from shadow-sm' : 'text-white/90 hover:bg-white/15',
  ].join(' ');
}

export function DashboardNav() {
  const { t } = useTranslation();

  return (
    <nav className="flex gap-1.5 overflow-x-auto pb-1 pt-0.5" aria-label={t('nav.main')}>
      {NAV_ITEMS.map((item) => (
        <NavLink key={item.to} to={item.to} end={item.end} className={linkClass}>
          {t(item.labelKey)}
        </NavLink>
      ))}
    </nav>
  );
}
