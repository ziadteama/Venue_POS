export function TrendBadge({
  changePercent,
  changeAmount,
  locale,
  currencyLabel,
  positiveIsGood = true,
  showAmount = true,
}) {
  const percent = Number(changePercent ?? 0);
  const isUp = percent >= 0;
  const isGood = positiveIsGood ? isUp : !isUp;
  const tone = isGood
    ? 'text-accent-700 bg-accent-50 ring-accent-200'
    : 'text-red-700 bg-red-50 ring-red-200';

  return (
    <span className={`chip ${tone}`}>
      <svg
        className={`h-3.5 w-3.5 ${isUp ? '' : 'rotate-180'}`}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M5 14 12 7l7 7" />
      </svg>
      {Math.abs(percent).toFixed(1)}%
      {showAmount && changeAmount != null ? (
        <span className="font-normal opacity-70">
          {new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(Math.abs(changeAmount))}{' '}
          {currencyLabel}
        </span>
      ) : null}
    </span>
  );
}
