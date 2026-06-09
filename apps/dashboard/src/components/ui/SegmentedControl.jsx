/**
 * Segmented control / pill tabs. `options` is an array of { value, label, count }.
 * Two visual variants: 'segment' (enclosed track) and 'pill' (free pills).
 */
export function SegmentedControl({
  options,
  value,
  onChange,
  variant = 'segment',
  size = 'md',
  className = '',
}) {
  const sizeClass = size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-3.5 py-2 text-sm';

  if (variant === 'pill') {
    return (
      <div className={`flex flex-wrap gap-2 ${className}`}>
        {options.map((opt) => {
          const active = opt.value === value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              className={`rounded-full font-medium transition duration-150 ease-premium ${sizeClass} ${
                active
                  ? 'bg-ink-900 text-white shadow-sm'
                  : 'border border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              {opt.label}
              {opt.count != null ? (
                <span className={`ms-1.5 ${active ? 'text-white/70' : 'text-slate-400'}`}>{opt.count}</span>
              ) : null}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className={`inline-flex rounded-xl border border-slate-200 bg-slate-100/70 p-1 ${className}`}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`rounded-lg font-semibold transition duration-150 ease-premium ${sizeClass} ${
              active ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            {opt.label}
            {opt.count != null ? (
              <span className={`ms-1.5 ${active ? 'text-accent-600' : 'text-slate-400'}`}>{opt.count}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
