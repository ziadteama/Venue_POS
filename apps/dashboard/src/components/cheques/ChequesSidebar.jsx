import { Link } from 'react-router-dom';
import { CrossVenueBadge } from '../CrossVenueBadge.jsx';
import { Button } from '../ui/Button.jsx';
import { EmptyState } from '../ui/EmptyState.jsx';
import { ChequeIcon } from '../dashboard/icons.jsx';

function venueName(c, language) {
  return language === 'ar' ? c.venueNameAr || c.venueNameEn : c.venueNameEn;
}

export function ChequesSidebar({
  t,
  statusTab,
  cheques,
  selectedId,
  onSelect,
  showVenueName = false,
  language,
}) {
  return (
    <aside className="surface-card overflow-hidden">
      <div className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-900">
        {statusTab === 'open' ? t('cheque.openList') : t('cheque.paidList')}
      </div>
      <ul className="scrollbar-slim max-h-[34rem] divide-y divide-slate-100 overflow-y-auto">
        {cheques.length === 0 ? (
          <li>
            <EmptyState
              icon={ChequeIcon}
              title={statusTab === 'open' ? t('cheque.noOpen') : t('cheque.noPaid')}
              className="py-10"
            />
          </li>
        ) : (
          cheques.map((c) => {
            const active = selectedId === c.id;
            return (
              <li key={c.id} className={active ? 'bg-accent-50/40' : ''}>
                <div className="flex items-stretch gap-1">
                  <button
                    type="button"
                    onClick={() => onSelect(c.id)}
                    className={`relative min-w-0 flex-1 px-4 py-3 text-start text-sm transition-colors ${
                      active ? '' : 'hover:bg-slate-50'
                    }`}
                  >
                    {active ? (
                      <span className="absolute inset-y-0 start-0 w-1 rounded-e bg-accent-gradient" />
                    ) : null}
                    {showVenueName && c.venueNameEn ? (
                      <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                        {venueName(c, language)}
                      </p>
                    ) : null}
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span
                        className={
                          active ? 'font-semibold text-slate-900' : 'font-medium text-slate-700'
                        }
                      >
                        {t('cheque.number', { number: c.chequeNumber })} —{' '}
                        {c.splitLabel ? `${c.tableLabel} (${c.splitLabel})` : c.tableLabel}
                      </span>
                      {c.isCrossVenue ? <CrossVenueBadge t={t} /> : null}
                    </div>
                    <div className="mt-0.5 font-semibold tabular-nums text-accent-700">
                      {c.total.toFixed(2)} {t('pos.currency')}
                    </div>
                  </button>
                  <div className="flex shrink-0 flex-col justify-center pe-2">
                    <Link to={`/orders?chequeId=${c.id}&venueId=${c.venueId}`}>
                      <Button variant="secondary" size="sm">
                        {t('cheque.ordersShort')}
                      </Button>
                    </Link>
                  </div>
                </div>
              </li>
            );
          })
        )}
      </ul>
    </aside>
  );
}
