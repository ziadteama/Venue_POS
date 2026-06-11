function formatAmount(value) {
  return Number(value ?? 0).toFixed(2);
}

/** Single cheque total (parent + split guests + cross-venue members when applicable). */
export function ChequeTotalsBlock({ total, t, size = 'md', className = '' }) {
  const amountClass =
    size === 'lg' ? 'text-2xl font-bold tabular-nums text-accent-700' : 'text-sm font-semibold tabular-nums text-accent-700';

  return (
    <div className={className}>
      <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
        {t('cheque.chequeTotal')}
      </p>
      <p className={amountClass}>
        {formatAmount(total)} {t('pos.currency')}
      </p>
    </div>
  );
}
