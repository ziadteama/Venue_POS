import { LanguageToggle } from './LanguageToggle.jsx';

export function PosHeader({ t, search, onSearchChange, tableLabel, onTableLabelChange, onTableBlur }) {
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

      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          <span className="text-white/80">{t('pos.tableLabel')}</span>
          <input
            value={tableLabel}
            onChange={(e) => onTableLabelChange(e.target.value)}
            onBlur={onTableBlur}
            className="w-16 rounded border border-white/30 bg-white/15 px-2 py-1 text-center text-sm"
          />
        </label>
        <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-medium ring-1 ring-white/25">
          {t('pos.dineIn')}
        </span>
        <LanguageToggle onDark />
      </div>
    </header>
  );
}
