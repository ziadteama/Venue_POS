import { CrossVenueBadge } from '../CrossVenueBadge.jsx';

export function ChequesSidebar({ t, statusTab, cheques, selectedId, onSelect }) {
  return (
    <aside className="rounded-xl border border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-4 py-3 font-medium">
        {statusTab === 'open' ? t('cheque.openList') : t('cheque.paidList')}
      </div>
      <ul className="max-h-[32rem] overflow-y-auto">
        {cheques.length === 0 ? (
          <li className="px-4 py-6 text-sm text-secondary">
            {statusTab === 'open' ? t('cheque.noOpen') : t('cheque.noPaid')}
          </li>
        ) : (
          cheques.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => onSelect(c.id)}
                className={`w-full border-b border-slate-100 px-4 py-3 text-start text-sm hover:bg-slate-50 ${
                  selectedId === c.id ? 'bg-primary-from/5 font-medium' : ''
                }`}
              >
                <div className="flex flex-wrap items-center gap-1.5">
                  <span>
                    {t('cheque.number', { number: c.chequeNumber })} —{' '}
                    {c.splitLabel ? `${c.tableLabel} (${c.splitLabel})` : c.tableLabel}
                  </span>
                  {c.isCrossVenue ? <CrossVenueBadge t={t} /> : null}
                </div>
                <div className="text-secondary">
                  {c.total.toFixed(2)} {t('pos.currency')}
                </div>
              </button>
            </li>
          ))
        )}
      </ul>
    </aside>
  );
}
