import { Link } from 'react-router-dom';

/** Small pill badge for cheques settled as part of a cross-venue group. */
export function CrossVenueBadge({ t, className = '' }) {
  return (
    <span
      className={`inline-flex items-center rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-800 ring-1 ring-violet-200 ${className}`}
    >
      {t('crossVenue.badge')}
    </span>
  );
}

function venueLabel(member, language) {
  return language === 'ar' ? member.venueNameAr || member.venueNameEn : member.venueNameEn;
}

function normalizeMembers(group) {
  if (group?.members?.length) return group.members;
  if (group?.cheques?.length) {
    return group.cheques.map((c) => ({
      id: c.id,
      chequeNumber: c.chequeNumber,
      venueId: c.venueId,
      venueNameEn: c.venueNameEn,
      venueNameAr: c.venueNameAr,
      tableLabel: c.tableLabel,
      status: c.status,
      total: c.total ?? c.firedSubtotal ?? 0,
    }));
  }
  return [];
}

export function CrossVenueGroupPanel({
  group,
  t,
  language,
  locale,
  formatMoney,
  linkMembers = false,
  currentVenueId,
}) {
  const members = normalizeMembers(group);
  if (!members.length) return null;
  const combinedTotal = members.reduce((sum, m) => sum + Number(m.total ?? 0), 0);
  return (
    <div className="rounded-lg border border-violet-200 bg-violet-50/60 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-violet-900">
          {t('crossVenue.linkedCheques')}
          {group.groupChequeNumber != null ? (
            <span className="ms-2 font-normal text-violet-700">#{group.groupChequeNumber}</span>
          ) : null}
        </p>
        <span className="text-xs font-medium tabular-nums text-violet-800">
          {formatMoney(combinedTotal, locale)} {t('pos.currency')} {t('cheque.groupTotal')}
        </span>
      </div>
      <ul className="space-y-1.5 text-sm">
        {members.map((member) => {
          const isCurrent = currentVenueId && member.venueId === currentVenueId;
          return (
            <li
              key={member.id}
              className={`flex items-center justify-between gap-2 rounded-md px-1.5 py-0.5 ${
                isCurrent ? 'bg-violet-100/80 font-medium' : 'text-violet-950'
              }`}
            >
              {linkMembers ? (
                <Link
                  to={`/cheques?chequeId=${member.id}&venueId=${member.venueId}`}
                  className="hover:underline"
                >
                  {venueLabel(member, language)} · #{member.chequeNumber} · {member.tableLabel}
                  {isCurrent ? ` (${t('crossVenue.currentVenue')})` : ''}
                </Link>
              ) : (
                <span>
                  {venueLabel(member, language)} · #{member.chequeNumber} · {member.tableLabel}
                </span>
              )}
              <span className="shrink-0 font-medium tabular-nums">
                {formatMoney(member.total, locale)} {t('pos.currency')}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
