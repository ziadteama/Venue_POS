import { useEffect, useRef, useState } from 'react';
import { LanguageToggle } from './LanguageToggle.jsx';
import { parentOpenCheques } from '../utils/cheque.js';

function HeaderDropdown({ label, title, children, align = 'end' }) {
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
        className="flex items-center gap-1.5 rounded-lg bg-white/10 px-2.5 py-2 text-sm font-medium ring-1 ring-white/20 transition hover:bg-white/20"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        {label}
        <svg
          className="h-3 w-3 shrink-0 text-white/70"
          viewBox="0 0 12 12"
          fill="none"
          aria-hidden="true"
        >
          <path d="M2.5 4.5 6 8l3.5-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
      {open ? (
        <div
          role="menu"
          className={`absolute top-full z-30 mt-1.5 min-w-[11rem] overflow-hidden rounded-xl bg-white py-1 text-slate-900 shadow-lg ring-1 ring-slate-200 ${
            align === 'end' ? 'end-0' : 'start-0'
          }`}
        >
          {typeof children === 'function' ? children(() => setOpen(false)) : children}
        </div>
      ) : null}
    </div>
  );
}

function MenuItem({ onClick, children, danger }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={`flex w-full px-3 py-2.5 text-start text-sm hover:bg-slate-50 ${
        danger ? 'text-red-600' : 'text-slate-800'
      }`}
    >
      {children}
    </button>
  );
}

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
  cashierUsername,
  onLogout,
}) {
  const openCount = parentOpenCheques(openCheques).length;
  const hasTools = onOrderLookup || (shift && onCloseShift);

  return (
    <header className="flex shrink-0 items-center gap-3 border-b border-white/5 bg-ink-gradient px-4 py-2.5 text-white shadow-card sm:gap-4 sm:px-5 sm:py-3">
      <div className="flex min-w-0 shrink-0 items-center gap-2.5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-gradient text-base font-bold shadow-card sm:h-10 sm:w-10">
          {t('pos.title')?.slice(0, 1) || 'V'}
        </div>
        <h1 className="hidden truncate text-base font-bold tracking-tight sm:block">{t('pos.title')}</h1>
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

      <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
        <button
          type="button"
          onClick={onOpenTables}
          className="group flex max-w-[9rem] items-center gap-2 rounded-xl bg-white/15 px-2.5 py-2 ring-1 ring-white/25 transition hover:bg-white/25 sm:max-w-none sm:px-3"
          title={t('pos.tableLabel')}
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/15 text-sm font-bold">
            {tableLabel || '\u2014'}
          </span>
          <span className="hidden min-w-0 text-start md:block">
            <span className="block text-[10px] uppercase tracking-wide text-white/70">
              {t('pos.tableLabel')}
            </span>
            <span className="block truncate text-sm font-semibold leading-tight">
              {tableLabel ? t('pos.tableActive', { table: tableLabel }) : t('pos.noTable')}
            </span>
          </span>
          {openCount > 0 ? (
            <span className="rounded-full bg-amber-400/90 px-1.5 py-0.5 text-[10px] font-bold text-amber-950">
              {openCount}
            </span>
          ) : null}
        </button>

        {hasTools ? (
          <HeaderDropdown label={t('pos.headerTools')} title={t('pos.headerTools')}>
            {(close) => (
              <>
                {onOrderLookup ? (
                  <MenuItem
                    onClick={() => {
                      close();
                      onOrderLookup();
                    }}
                  >
                    {t('pos.orderLookup')}
                  </MenuItem>
                ) : null}
                {shift && onCloseShift ? (
                  <MenuItem
                    onClick={() => {
                      close();
                      onCloseShift();
                    }}
                  >
                    {t('pos.shiftCloseTitle')}
                    <span className="ms-1 text-secondary">
                      ({Number(shift.openFloat).toFixed(0)} {t('pos.currency')})
                    </span>
                  </MenuItem>
                ) : null}
              </>
            )}
          </HeaderDropdown>
        ) : null}

        {cashierUsername || onLogout ? (
          <HeaderDropdown
            label={cashierUsername ?? t('pos.headerAccount')}
            title={cashierUsername ?? t('pos.headerAccount')}
          >
            {(close) => (
              <>
                {cashierUsername ? (
                  <div className="border-b border-slate-100 px-3 py-2 text-xs text-secondary">
                    {cashierUsername}
                  </div>
                ) : null}
                {onLogout ? (
                  <MenuItem
                    danger
                    onClick={() => {
                      close();
                      onLogout();
                    }}
                  >
                    {t('pos.logout')}
                  </MenuItem>
                ) : null}
              </>
            )}
          </HeaderDropdown>
        ) : null}

        <LanguageToggle onDark />
      </div>
    </header>
  );
}
