import { formatMoney, formatShortDate } from '../../utils/dashboardFormat.js';
import { InboxIcon } from './icons.jsx';

const TYPE_STYLES = {
  refund: { dot: 'bg-red-500', chip: 'bg-red-50 text-red-700 ring-red-200' },
  discount: { dot: 'bg-amber-500', chip: 'bg-amber-50 text-amber-800 ring-amber-200' },
  discount_change: { dot: 'bg-amber-500', chip: 'bg-amber-50 text-amber-800 ring-amber-200' },
  discount_remove: { dot: 'bg-slate-400', chip: 'bg-slate-100 text-slate-700 ring-slate-200' },
  void: { dot: 'bg-slate-400', chip: 'bg-slate-100 text-slate-700 ring-slate-200' },
  comp: { dot: 'bg-violet-500', chip: 'bg-violet-50 text-violet-700 ring-violet-200' },
  transfer: { dot: 'bg-blue-500', chip: 'bg-blue-50 text-blue-700 ring-blue-200' },
  config: { dot: 'bg-indigo-500', chip: 'bg-indigo-50 text-indigo-700 ring-indigo-200' },
  shift_open: { dot: 'bg-accent-500', chip: 'bg-accent-50 text-accent-700 ring-accent-200' },
  shift_close: { dot: 'bg-accent-500', chip: 'bg-accent-50 text-accent-700 ring-accent-200' },
};

const FALLBACK = { dot: 'bg-slate-400', chip: 'bg-slate-100 text-slate-700 ring-slate-200' };

function typeLabel(type, t) {
  const key = `dashboard.activityType.${type}`;
  const translated = t(key);
  return translated === key ? type.replace(/_/g, ' ') : translated;
}

export function RecentActivityFeed({ events, t, locale, currencyLabel, emptyLabel }) {
  if (!events?.length) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-200 px-4 py-12 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
          <InboxIcon className="h-6 w-6" />
        </span>
        <p className="text-sm text-slate-500">{emptyLabel}</p>
      </div>
    );
  }

  return (
    <ul className="relative space-y-1">
      <span className="absolute bottom-2 start-[7px] top-2 w-px bg-slate-200" aria-hidden="true" />
      {events.map((event) => {
        const style = TYPE_STYLES[event.type] ?? FALLBACK;
        return (
          <li key={event.id} className="relative flex gap-4 rounded-xl px-2 py-2.5 transition hover:bg-slate-50">
            <span className="relative z-10 mt-1.5">
              <span className={`block h-3.5 w-3.5 rounded-full ring-4 ring-white ${style.dot}`} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className={`chip ${style.chip}`}>{typeLabel(event.type, t)}</span>
                {event.amount != null ? (
                  <span className="text-xs font-semibold text-slate-700">
                    {formatMoney(event.amount, locale, currencyLabel)}
                  </span>
                ) : null}
              </div>
              <p className="mt-1 truncate text-sm font-medium text-slate-800">
                {event.summary || event.detail}
              </p>
              <p className="mt-0.5 text-xs text-slate-400">
                {event.actor ? `${event.actor} · ` : ''}
                {formatShortDate(event.at, locale)}
                {event.chequeNumber ? ` · #${event.chequeNumber}` : ''}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
