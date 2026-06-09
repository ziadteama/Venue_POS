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

export function CrossVenueGroupPanel({ group, t, language, locale, formatMoney }) {
  if (!group?.members?.length) return null;
  return (
    <div className="rounded-lg border border-violet-200 bg-violet-50/60 p-3">
      <p className="mb-2 text-sm font-semibold text-violet-900">{t('crossVenue.linkedCheques')}</p>
      <ul className="space-y-1.5 text-sm">
        {group.members.map((member) => (
          <li key={member.id} className="flex items-center justify-between gap-2 text-violet-950">
            <span>
              {venueLabel(member, language)} · #{member.chequeNumber} · {member.tableLabel}
            </span>
            <span className="shrink-0 font-medium">
              {formatMoney(member.total, locale)} {t('pos.currency')}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
