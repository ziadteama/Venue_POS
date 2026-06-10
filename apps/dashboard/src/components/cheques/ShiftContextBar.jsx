import { OpsContextBar } from '../dashboard/OpsContextBar.jsx';

export function ShiftContextBar({ shiftContext, shiftId, chequeCount, t, onClear, hintKey = 'cheque.shiftFilterHint' }) {
  if (!shiftId) return null;

  const shiftLabel = shiftContext
    ? t('cheque.shiftFilterLabel', {
        cashier: shiftContext.cashierUsername ?? '—',
        terminal: shiftContext.terminalName ?? '—',
      })
    : t('cheque.shiftFilterLoading');

  return (
    <OpsContextBar
      breadcrumb={[
        { label: t('nav.shifts'), to: '/shifts' },
        { label: shiftLabel },
      ]}
      hint={t(hintKey, { count: chequeCount ?? 0 })}
      backTo="/shifts"
      backLabel={t('cheque.backToShifts')}
      onClear={onClear}
      clearLabel={t('cheque.clearShiftFilter')}
    />
  );
}
