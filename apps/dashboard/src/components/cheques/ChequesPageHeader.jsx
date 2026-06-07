export function ChequesPageHeader({
  t,
  i18n,
  user,
  statusTab,
  venues,
  venueId,
  onTabChange,
  onVenueChange,
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <h2 className="text-xl font-semibold">{t('cheque.title')}</h2>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-lg border border-slate-200 p-0.5 text-sm">
          {['open', 'paid'].map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => onTabChange(tab)}
              className={`rounded-md px-3 py-1.5 ${
                statusTab === tab ? 'bg-primary-gradient text-white' : 'text-secondary'
              }`}
            >
              {tab === 'open' ? t('cheque.tabOpen') : t('cheque.tabPaid')}
            </button>
          ))}
        </div>
        {['hub_owner', 'hub_manager'].includes(user?.role) && venues.length > 1 && (
          <select
            className="rounded border px-3 py-2 text-sm"
            value={venueId}
            onChange={(e) => onVenueChange(e.target.value)}
          >
            {venues.map((v) => (
              <option key={v.id} value={v.id}>
                {i18n.language === 'ar' ? v.nameAr : v.nameEn}
              </option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}
