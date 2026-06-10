import { Link } from 'react-router-dom';
import { OpsBreadcrumb } from './OpsBreadcrumb.jsx';
import { Button } from '../ui/Button.jsx';

/** Sticky filter/context strip for Shifts → Cheques → Orders deep links. */
export function OpsContextBar({ breadcrumb, hint, backTo, backLabel, onClear, clearLabel }) {
  if (!breadcrumb?.length) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="space-y-1">
        <OpsBreadcrumb items={breadcrumb} />
        {hint ? <p className="text-xs text-slate-500">{hint}</p> : null}
      </div>
      <div className="flex flex-wrap gap-2">
        {backTo && backLabel ? (
          <Link to={backTo} className="inline-flex items-center text-sm font-medium text-accent-700 hover:underline">
            {backLabel}
          </Link>
        ) : null}
        {onClear && clearLabel ? (
          <Button variant="secondary" size="sm" onClick={onClear}>
            {clearLabel}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
