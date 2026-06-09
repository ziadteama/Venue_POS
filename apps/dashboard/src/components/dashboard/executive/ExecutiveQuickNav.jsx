import { Link } from 'react-router-dom';
import { SectionCard } from '../../ui/Card.jsx';
import { AnalyticsIcon, ArrowUpRightIcon } from '../icons.jsx';

const SECTION_LINKS = [
  { hash: '#attention', labelKey: 'dashboard.navAttention' },
  { hash: '#summary', labelKey: 'dashboard.navSummary', financial: true },
  { hash: '#revenue', labelKey: 'dashboard.navRevenue', financial: true },
  { hash: '#venues', labelKey: 'dashboard.navVenues' },
  { hash: '#activity', labelKey: 'dashboard.navActivity' },
  { hash: '#financial', labelKey: 'dashboard.navFinancial', financial: true },
  { hash: '#operations', labelKey: 'dashboard.navOperations' },
];

export function ExecutiveQuickNav({ t, canSeeFinancials, venueId }) {
  const links = SECTION_LINKS.filter((link) => !link.financial || canSeeFinancials);

  return (
    <SectionCard title={t('dashboard.executiveQuickNav')} hint={t('dashboard.executiveQuickNavHint')}>
      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        {canSeeFinancials ? (
          <Link
            to={venueId ? `/analytics?venueId=${encodeURIComponent(venueId)}` : '/analytics'}
            className="group flex items-center justify-between gap-3 rounded-xl border border-accent-200 bg-gradient-to-br from-accent-50 to-white p-4 transition hover:-translate-y-0.5 hover:shadow-card-hover"
          >
            <span className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-gradient text-white shadow-sm">
                <AnalyticsIcon className="h-5 w-5" />
              </span>
              <span className="text-sm font-semibold text-slate-800">{t('nav.analytics')}</span>
            </span>
            <ArrowUpRightIcon className="h-4 w-4 text-accent-600" />
          </Link>
        ) : null}

        {links.map(({ hash, labelKey }) => (
          <a
            key={hash}
            href={hash}
            className="group flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-surface-overlay p-4 transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-card-hover"
          >
            <span className="text-sm font-semibold text-slate-700">{t(labelKey)}</span>
            <ArrowUpRightIcon className="h-4 w-4 text-slate-400 transition group-hover:text-accent-600" />
          </a>
        ))}
      </div>
    </SectionCard>
  );
}
