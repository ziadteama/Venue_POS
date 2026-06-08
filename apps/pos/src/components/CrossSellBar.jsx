function venueLabel(venue, language) {
  return language === 'ar' ? venue.nameAr || venue.nameEn : venue.nameEn;
}

export function CrossSellBar({
  t,
  language,
  crossSell,
  homeVenueId,
  groupLocked = false,
}) {
  const {
    canCrossSell,
    crossSellMode,
    setCrossSellMode,
    venues,
    activeVenueId,
    selectVenue,
  } = crossSell;

  if (!canCrossSell) return null;

  return (
    <div className="flex shrink-0 flex-col gap-2 border-b border-slate-200 bg-white px-4 py-2">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-secondary">
          {t('crossVenue.orderMode')}
        </span>
        <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-sm">
          <button
            type="button"
            disabled={groupLocked}
            onClick={() => setCrossSellMode(false)}
            className={`rounded-md px-3 py-1.5 font-medium ${
              !crossSellMode
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-secondary hover:text-slate-700'
            } disabled:opacity-50`}
          >
            {t('crossVenue.modeStandard')}
          </button>
          <button
            type="button"
            onClick={() => setCrossSellMode(true)}
            className={`rounded-md px-3 py-1.5 font-medium ${
              crossSellMode
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-secondary hover:text-slate-700'
            }`}
          >
            {t('crossVenue.modeCrossSell')}
          </button>
        </div>
        {groupLocked ? (
          <span className="text-xs text-amber-700">{t('crossVenue.groupLocked')}</span>
        ) : null}
      </div>

      {crossSellMode ? (
        <div className="flex gap-2 overflow-x-auto pb-0.5">
          {venues.map((venue) => {
            const isHome = venue.id === homeVenueId;
            const isActive = venue.id === activeVenueId;
            return (
              <button
                key={venue.id}
                type="button"
                onClick={() => selectVenue(venue.id)}
                className={`shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium ${
                  isActive
                    ? 'bg-primary-gradient text-white shadow-sm'
                    : 'bg-slate-50 text-secondary hover:bg-slate-100'
                }`}
              >
                {isHome
                  ? t('crossVenue.homeVenue', { venue: venueLabel(venue, language) })
                  : venueLabel(venue, language)}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
