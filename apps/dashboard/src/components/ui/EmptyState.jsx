import { InboxIcon } from '../dashboard/icons.jsx';

/** Consistent empty state: icon chip, title, hint, optional action. */
export function EmptyState({ icon: Icon = InboxIcon, title, hint, action, className = '' }) {
  return (
    <div className={`flex flex-col items-center justify-center gap-3 px-6 py-12 text-center ${className}`}>
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
        <Icon className="h-6 w-6" />
      </span>
      {title ? <p className="text-sm font-semibold text-slate-700">{title}</p> : null}
      {hint ? <p className="max-w-sm text-sm text-slate-500">{hint}</p> : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
