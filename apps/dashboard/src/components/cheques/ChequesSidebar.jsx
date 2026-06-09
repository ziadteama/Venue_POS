import { CrossVenueBadge } from '../CrossVenueBadge.jsx';
import { EmptyState } from '../ui/EmptyState.jsx';
import { ChequeIcon } from '../dashboard/icons.jsx';

export function ChequesSidebar({ t, statusTab, cheques, selectedId, onSelect }) {
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
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => onSelect(c.id)}
                  className={`relative w-full px-4 py-3 text-start text-sm transition-colors ${
                    active ? 'bg-accent-50/70' : 'hover:bg-slate-50'
                  }`}
                >
                  {active ? (
                    <span className="absolute inset-y-0 start-0 w-1 rounded-e bg-accent-gradient" />
                  ) : null}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className={active ? 'font-semibold text-slate-900' : 'font-medium text-slate-700'}>
                      {t('cheque.number', { number: c.chequeNumber })} —{' '}
                      {c.splitLabel ? `${c.tableLabel} (${c.splitLabel})` : c.tableLabel}
                    </span>
                    {c.isCrossVenue ? <CrossVenueBadge t={t} /> : null}
                  </div>
                  <div className="mt-0.5 font-semibold tabular-nums text-accent-700">
                    {c.total.toFixed(2)} {t('pos.currency')}
                  </div>
                </button>
              </li>
            );
          })
        )}
      </ul>
    </aside>
  );
}
