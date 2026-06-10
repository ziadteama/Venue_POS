import { CrossVenueBadge } from '../CrossVenueBadge.jsx';

export function CrossVenueChequesSidebar({
  groups,
  selectedMemberId,
  onSelectMember,
  crossGroupStatus,
  t,
  language,
}) {
  return (
    <aside className="surface-card overflow-hidden">
      <div className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-900">
        {crossGroupStatus === 'open' ? t('cheque.crossSellOpen') : t('cheque.crossSellPaid')}
      </div>
      <ul className="scrollbar-slim max-h-[34rem] divide-y divide-slate-100 overflow-y-auto">
      {!groups.length ? (
        <li>
          <p className="px-4 py-8 text-center text-sm text-slate-500">{t('cheque.emptyCrossSell')}</p>
        </li>
      ) : null}
      {groups.map((group) => (
        <li key={group.groupId} className="px-4 py-3">
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            <span className="font-semibold text-slate-900">
              {t('cheque.number', { number: group.chequeNumber })}
            </span>
            <CrossVenueBadge t={t} />
            <span className="text-xs text-slate-500">· {group.tableLabel}</span>
          </div>
          <p className="mb-2 text-xs font-medium tabular-nums text-accent-700">
            {group.combinedTotal.toFixed(2)} {t('pos.currency')} {t('cheque.groupTotal')}
          </p>
          <ul className="space-y-1">
            {group.members.map((member) => {
              const active = selectedMemberId === member.chequeId;
              const venueName =
                language === 'ar' ? member.venueNameAr || member.venueNameEn : member.venueNameEn;
              return (
                <li key={member.chequeId}>
                  <button
                    type="button"
                    onClick={() => onSelectMember(member)}
                    className={`w-full rounded-lg px-2 py-1.5 text-start text-sm transition-colors ${
                      active ? 'bg-violet-100 text-violet-950' : 'hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <span className="font-medium">{venueName}</span>
                    <span className="ms-1 tabular-nums text-slate-500">
                      {member.total.toFixed(2)} {t('pos.currency')}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </li>
      ))}
    </ul>
    </aside>
  );
}
