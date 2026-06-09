export function TrendBadge({ changePercent, changeAmount, locale, currencyLabel, positiveIsGood = true }) {
  const percent = Number(changePercent ?? 0);
  const isUp = percent >= 0;
  const isGood = positiveIsGood ? isUp : !isUp;
  const tone = isGood ? 'text-emerald-700 bg-emerald-50 ring-emerald-100' : 'text-red-700 bg-red-50 ring-red-100';

  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${tone}`}>
      {isUp ? '↑' : '↓'} {Math.abs(percent).toFixed(1)}%
      {changeAmount != null ? (
        <span className="ms-1 opacity-80">
          ({new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(Math.abs(changeAmount))}{' '}
          {currencyLabel})
        </span>
      ) : null}
    </span>
  );
}
