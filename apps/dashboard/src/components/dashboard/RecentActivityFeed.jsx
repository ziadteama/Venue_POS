import { formatMoney, formatShortDate } from '../../utils/dashboardFormat.js';

const TYPE_STYLES = {
  refund: 'bg-red-50 text-red-800 ring-red-100',
  discount: 'bg-amber-50 text-amber-900 ring-amber-100',
  discount_change: 'bg-amber-50 text-amber-900 ring-amber-100',
  discount_remove: 'bg-slate-100 text-slate-700 ring-slate-200',
  void: 'bg-slate-100 text-slate-700 ring-slate-200',
  comp: 'bg-violet-50 text-violet-800 ring-violet-100',
  transfer: 'bg-blue-50 text-blue-800 ring-blue-100',
  config: 'bg-indigo-50 text-indigo-800 ring-indigo-100',
  shift_open: 'bg-emerald-50 text-emerald-800 ring-emerald-100',
  shift_close: 'bg-emerald-50 text-emerald-800 ring-emerald-100',
};

function typeLabel(type, t) {
  const key = `dashboard.activityType.${type}`;
  const translated = t(key);
  return translated === key ? type.replace(/_/g, ' ') : translated;
}

export function RecentActivityFeed({ events, t, locale, currencyLabel, emptyLabel }) {
  if (!events?.length) {
    return (
      <p className="rounded-xl border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-500">
        {emptyLabel}
      </p>
    );
  }

  return (
    <ul className="divide-y divide-slate-100">
      {events.map((event) => {
        const style = TYPE_STYLES[event.type] ?? 'bg-slate-50 text-slate-700 ring-slate-200';
        return (
          <li key={event.id} className="flex gap-4 py-4 first:pt-0 last:pb-0">
            <span
              className={`mt-0.5 inline-flex h-8 shrink-0 items-center rounded-full px-2.5 text-[11px] font-semibold uppercase tracking-wide ring-1 ${style}`}
            >
              {typeLabel(event.type, t)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-slate-900">{event.summary || event.detail}</p>
              <p className="mt-1 text-xs text-slate-500">
                {event.actor ? `${event.actor} · ` : ''}
                {formatShortDate(event.at, locale)}
                {event.chequeNumber ? ` · #${event.chequeNumber}` : ''}
                {event.amount != null
                  ? ` · ${formatMoney(event.amount, locale, currencyLabel)}`
                  : ''}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
