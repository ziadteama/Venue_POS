const VARIANTS = {
  primary:
    'bg-accent-gradient text-white shadow-sm hover:shadow-card-hover hover:brightness-[1.04] active:brightness-95',
  secondary:
    'border border-slate-200 bg-white text-slate-700 shadow-sm hover:border-slate-300 hover:bg-slate-50 active:bg-slate-100',
  danger:
    'bg-red-600 text-white shadow-sm hover:bg-red-700 active:bg-red-800',
  'danger-soft':
    'border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 hover:border-red-300',
  subtle: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
  ink: 'bg-ink-800 text-white shadow-sm hover:bg-ink-700 active:bg-ink-900',
};

const SIZES = {
  sm: 'px-3 py-1.5 text-xs gap-1.5',
  md: 'px-4 py-2.5 text-sm gap-2',
  lg: 'px-5 py-3 text-[0.95rem] gap-2',
  icon: 'p-2',
};

/**
 * Standardized button. Variants: primary | secondary | danger | danger-soft | subtle | ink.
 * Renders an <a>/<Link>-like element when `as` is provided.
 */
export function Button({
  variant = 'secondary',
  size = 'md',
  loading = false,
  disabled = false,
  type = 'button',
  className = '',
  as: Component = 'button',
  children,
  ...props
}) {
  const isButton = Component === 'button';
  return (
    <Component
      type={isButton ? type : undefined}
      disabled={isButton ? disabled || loading : undefined}
      aria-busy={loading || undefined}
      className={`inline-flex items-center justify-center rounded-xl font-semibold transition duration-200 ease-premium disabled:cursor-not-allowed disabled:opacity-50 ${
        VARIANTS[variant] ?? VARIANTS.secondary
      } ${SIZES[size] ?? SIZES.md} ${className}`}
      {...props}
    >
      {loading ? (
        <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.4 0 0 5.4 0 12h4Z" />
        </svg>
      ) : null}
      {children}
    </Component>
  );
}
