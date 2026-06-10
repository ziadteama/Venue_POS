import { Link } from 'react-router-dom';
import { OpsBreadcrumb } from '../dashboard/OpsBreadcrumb.jsx';
import { Button } from '../ui/Button.jsx';

export function ShiftContextBar({ shiftContext, shiftId, chequeCount, t, onClear }) {
  if (!shiftId) return null;

  const shiftLabel = shiftContext
    ? t('cheque.shiftFilterLabel', {
        cashier: shiftContext.cashierUsername ?? '—',
        terminal: shiftContext.terminalName ?? '—',
      })
    : t('cheque.shiftFilterLoading');

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="space-y-1">
        <OpsBreadcrumb
          items={[
            { label: t('nav.shifts'), to: '/shifts' },
            { label: shiftLabel },
          ]}
        />
        <p className="text-xs text-slate-500">
          {t('cheque.shiftFilterHint', { count: chequeCount })}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link
          to={`/shifts`}
          className="text-sm font-medium text-accent-700 hover:underline"
        >
          {t('cheque.backToShifts')}
        </Link>
        <Button variant="secondary" size="sm" onClick={onClear}>
          {t('cheque.clearShiftFilter')}
        </Button>
      </div>
    </div>
  );
}
