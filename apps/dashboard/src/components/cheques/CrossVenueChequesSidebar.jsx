import { CrossVenueBadge } from '../CrossVenueBadge.jsx';
import { SegmentedControl } from '../ui/SegmentedControl.jsx';

export function CrossVenueChequesSidebar({
  groups,
  selectedMemberId,
  onSelectMember,
  crossGroupStatus,
  onCrossGroupStatusChange,
  t,
  language,
}) {
  return (
    <aside className="surface-card overflow-hidden">
      <div className="space-y-2 border-b border-slate-100 px-3 py-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          {t('cheque.tabCrossSell')}
        </p>
        <SegmentedControl
          options={[
            { value: 'open', label: t('cheque.tabOpen') },
            { value: 'paid', label: t('cheque.tabPaid') },
          ]}
          value={crossGroupStatus}
          onChange={onCrossGroupStatusChange}
        />
      </div>
      <ul className="scrollbar-slim max-h-[32rem] divide-y divide-slate-100 overflow-y-auto">
        {!groups.length ? (
          <li>
            <p className="px-4 py-8 text-center text-sm text-slate-500">{t('cheque.emptyCrossSell')}</p>
          </li>
        ) : null}
        {groups.map((group) => (
          <li key={group.groupId} className="px-3 py-3">
            <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
              <span className="text-sm font-semibold text-slate-900">
                #{group.chequeNumber}
              </span>
              <CrossVenueBadge t={t} />
            </div>
            <p className="mb-2 truncate text-xs text-slate-500">{group.tableLabel}</p>
            <p className="mb-2 text-xs font-medium tabular-nums text-accent-700">
              {group.combinedTotal.toFixed(2)} {t('pos.currency')}
            </p>
            <ul className="space-y-0.5">
              {group.members.map((member) => {
                const active = selectedMemberId === member.chequeId;
                const venueName =
                  language === 'ar' ? member.venueNameAr || member.venueNameEn : member.venueNameEn;
                return (
                  <li key={member.chequeId}>
                    <button
                      type="button"
                      onClick={() => onSelectMember(member)}
                      className={`w-full rounded-md px-2 py-1.5 text-start text-sm transition-colors ${
                        active ? 'bg-violet-100 text-violet-950' : 'text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <span className="font-medium">{venueName}</span>
                      <span className="ms-1 tabular-nums text-slate-500">
                        {member.total.toFixed(2)}
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
