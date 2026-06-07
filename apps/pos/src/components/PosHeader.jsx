import { LanguageToggle } from './LanguageToggle.jsx';
import { parentOpenCheques } from '../utils/cheque.js';

export function PosHeader({
  t,
  search,
  onSearchChange,
  tableLabel,
  openCheques,
  onOpenTables,
  shift,
  onCloseShift,
  onOrderLookup,
}) {
  const openCount = parentOpenCheques(openCheques).length;

  return (
    <header className="flex shrink-0 items-center gap-4 bg-primary-gradient px-5 py-3 text-white shadow-md">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 text-lg font-bold">
          V
        </div>
        <h1 className="text-lg font-bold">{t('pos.title')}</h1>
      </div>

      <div className="mx-auto w-full max-w-md">
        <input
          type="search"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={t('pos.searchMenu')}
          className="w-full rounded-lg border border-white/20 bg-white/10 px-4 py-2 text-sm text-white placeholder:text-white/60 focus:border-white/40 focus:outline-none"
        />
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onOpenTables}
          className="group flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2 ring-1 ring-white/20 transition hover:bg-white/20"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/15 text-sm font-bold">
            {tableLabel || '—'}
          </span>
          <span className="hidden text-start sm:block">
            <span className="block text-[10px] uppercase tracking-wide text-white/70">
              {t('pos.tableLabel')}
            </span>
            <span className="block text-sm font-semibold leading-tight">
              {tableLabel ? t('pos.tableActive', { table: tableLabel }) : t('pos.noTable')}
            </span>
          </span>
          {openCount > 0 ? (
            <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs font-medium">
              {openCount}
            </span>
          ) : null}
        </button>

        {onOrderLookup && (
          <button
            type="button"
            onClick={onOrderLookup}
            className="rounded-full bg-white/15 px-3 py-1.5 text-xs font-medium ring-1 ring-white/25 hover:bg-white/25"
          >
            {t('pos.orderLookup')}
          </button>
        )}
        {shift && (
          <button
            type="button"
            onClick={onCloseShift}
            className="rounded-full bg-white/15 px-3 py-1.5 text-xs font-medium ring-1 ring-white/25 hover:bg-white/25"
            title={t('pos.shiftCloseTitle')}
          >
            {t('pos.shiftActive', { float: Number(shift.openFloat).toFixed(0) })}
          </button>
        )}
        <span className="hidden rounded-full bg-white/15 px-3 py-1.5 text-xs font-medium ring-1 ring-white/25 md:inline">
          {t('pos.dineIn')}
        </span>
        <LanguageToggle onDark />
      </div>
    </header>
  );
}
