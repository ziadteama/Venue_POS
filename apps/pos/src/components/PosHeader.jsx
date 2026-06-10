import { useEffect, useRef, useState } from 'react';
import { LanguageToggle } from './LanguageToggle.jsx';
import { OrdersIcon, ShiftIcon, TablesIcon, UserIcon } from './icons.jsx';

function HeaderAccountMenu({ label, title, onLogout, t }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    function onPointerDown(e) {
      if (!rootRef.current?.contains(e.target)) setOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        title={title}
        onClick={() => setOpen((v) => !v)}
        className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/20 transition hover:bg-white/20"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <UserIcon className="h-4 w-4" />
        <span className="sr-only">{label}</span>
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute end-0 top-full z-30 mt-1.5 min-w-[11rem] overflow-hidden rounded-xl bg-white py-1 text-slate-900 shadow-lg ring-1 ring-slate-200"
        >
          <div className="border-b border-slate-100 px-3 py-2 text-xs font-medium text-slate-500">
            {label}
          </div>
          {onLogout ? (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onLogout();
              }}
              className="flex w-full px-3 py-2.5 text-start text-sm text-red-600 hover:bg-red-50"
            >
              {t('pos.logout')}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function HeaderAction({
  icon: Icon,
  label,
  shortLabel,
  onClick,
  title,
  variant = 'ghost',
  badge,
  className = '',
}) {
  const isPrimary = variant === 'primary';

  return (
    <button
      type="button"
      onClick={onClick}
      title={title ?? label}
      className={`relative flex shrink-0 items-center gap-2 rounded-xl px-2.5 py-2 text-sm font-semibold transition sm:px-3 ${
        isPrimary
          ? 'bg-white text-ink-900 shadow-sm ring-1 ring-white/40 hover:bg-white/95'
          : 'bg-white/10 text-white ring-1 ring-white/20 hover:bg-white/20'
      } ${className}`}
    >
      <Icon className={`h-4 w-4 shrink-0 ${isPrimary ? 'text-accent-600' : ''}`} />
      <span className="hidden sm:inline">{shortLabel ?? label}</span>
      {badge != null && badge > 0 ? (
        <span
          className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none ${
            isPrimary ? 'bg-accent-100 text-accent-800' : 'bg-amber-400/90 text-amber-950'
          }`}
        >
          {badge}
        </span>
      ) : null}
    </button>
  );
}

export function PosHeader({
  t,
  search,
  onSearchChange,
  tableLabel,
  serviceMode,
  openCheques,
  onOpenTables,
  shift,
  onCloseShift,
  onOrderLookup,
  cashierUsername,
  onLogout,
}) {
  const openCount = openCheques.length;
  const isTakeaway = serviceMode === 'takeaway';
  const tableDisplay = isTakeaway ? t('pos.takeAway') : tableLabel || t('pos.noTable');
  const tableTitle = isTakeaway
    ? t('pos.takeAway')
    : tableLabel
      ? t('pos.tableActive', { table: tableLabel })
      : t('pos.chooseTable');

  return (
    <header className="flex shrink-0 flex-col gap-2 border-b border-white/5 bg-ink-gradient px-3 py-2.5 text-white shadow-card sm:px-4 sm:py-3">
      <div className="flex items-center gap-2 sm:gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-gradient text-base font-bold shadow-card sm:h-10 sm:w-10">
          {t('pos.title')?.slice(0, 1) || 'V'}
        </div>

        <div className="min-w-0 flex-1">
          <input
            type="search"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={t('pos.searchMenu')}
            className="w-full rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-white/55 transition focus:border-accent-400/60 focus:bg-white/15 focus:outline-none focus:ring-2 focus:ring-accent-400/25 sm:px-4"
          />
        </div>

        {(cashierUsername || onLogout) && (
          <HeaderAccountMenu
            label={cashierUsername ?? t('pos.headerAccount')}
            title={cashierUsername ?? t('pos.headerAccount')}
            onLogout={onLogout}
            t={t}
          />
        )}

        <LanguageToggle onDark />
      </div>

      <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 sm:gap-2">
        <HeaderAction
          icon={TablesIcon}
          label={t('pos.tablesTitle')}
          shortLabel={tableLabel || isTakeaway ? tableDisplay : t('pos.tablesTitle')}
          onClick={onOpenTables}
          title={tableTitle}
          variant="primary"
          badge={openCount}
          className="min-w-0"
        />

        {onOrderLookup ? (
          <HeaderAction
            icon={OrdersIcon}
            label={t('pos.orderLookup')}
            onClick={onOrderLookup}
            title={t('pos.orderLookupTitle')}
          />
        ) : null}

        {shift && onCloseShift ? (
          <HeaderAction
            icon={ShiftIcon}
            label={t('pos.endShift')}
            shortLabel={t('pos.endShift')}
            onClick={onCloseShift}
            title={t('pos.shiftCloseHint')}
            className="ms-auto border border-amber-300/30 bg-amber-400/15 ring-amber-300/25 hover:bg-amber-400/25"
          />
        ) : null}
      </div>
    </header>
  );
}
