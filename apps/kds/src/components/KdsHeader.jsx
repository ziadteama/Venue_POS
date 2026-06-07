import { LanguageToggle } from './LanguageToggle.jsx';

export function KdsHeader({ title, subtitle, connected, onlineLabel, offlineLabel }) {
  return (
    <header className="shrink-0 bg-primary-gradient text-white shadow-md">
      <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15 text-lg font-bold">
            V
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-bold tracking-tight">{title}</h1>
            {subtitle ? <p className="truncate text-sm text-white/80">{subtitle}</p> : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span
            className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium ring-1 ${
              connected
                ? 'bg-white/10 text-emerald-100 ring-emerald-300/40'
                : 'bg-white/10 text-red-100 ring-red-300/40'
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full ${connected ? 'bg-emerald-300' : 'bg-red-300'}`}
            />
            {connected ? onlineLabel : offlineLabel}
          </span>
          <LanguageToggle onDark />
        </div>
      </div>
    </header>
  );
}
