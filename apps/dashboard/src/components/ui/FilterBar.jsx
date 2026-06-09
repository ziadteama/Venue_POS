import { useState } from 'react';
import { SearchIcon, FilterIcon, ChevronDownIcon } from '../dashboard/icons.jsx';
import { Button } from './Button.jsx';

/**
 * Search input with a leading icon, sized to sit inside a FilterBar.
 */
export function SearchInput({ value, onChange, placeholder, className = '' }) {
  return (
    <div className={`relative min-w-0 ${className}`}>
      <SearchIcon className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="premium-input ps-9"
      />
    </div>
  );
}

/**
 * Consistent filter toolbar. `primary` is always visible; `advanced` is hidden
 * behind a "more filters" toggle for progressive disclosure. `onReset` and
 * `actions` render on the trailing edge.
 */
export function FilterBar({
  primary,
  advanced,
  actions,
  onReset,
  resetLabel = 'Reset',
  moreLabel = 'More filters',
  className = '',
}) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  return (
    <section className={`surface-card p-4 ${className}`}>
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2.5">{primary}</div>
        <div className="flex shrink-0 items-center gap-2">
          {advanced ? (
            <Button
              variant="subtle"
              size="sm"
              onClick={() => setShowAdvanced((v) => !v)}
              className="border border-slate-200"
            >
              <FilterIcon className="h-4 w-4" />
              {moreLabel}
              <ChevronDownIcon className={`h-4 w-4 transition ${showAdvanced ? 'rotate-180' : ''}`} />
            </Button>
          ) : null}
          {onReset ? (
            <Button variant="subtle" size="sm" onClick={onReset}>
              {resetLabel}
            </Button>
          ) : null}
          {actions}
        </div>
      </div>

      {advanced && showAdvanced ? (
        <div className="mt-4 grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {advanced}
        </div>
      ) : null}
    </section>
  );
}
