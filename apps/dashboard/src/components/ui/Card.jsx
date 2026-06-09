export function Card({ children, className = '', interactive = false }) {
  return (
    <div className={`${interactive ? 'surface-card-interactive' : 'surface-card'} ${className}`}>
      {children}
    </div>
  );
}

/**
 * Section card with an optional header (title, hint, action slot) and a padded body.
 * Set `flush` to render children without body padding (e.g. for tables).
 */
export function SectionCard({
  id,
  title,
  hint,
  action,
  icon: Icon,
  children,
  className = '',
  bodyClassName = '',
  flush = false,
}) {
  const hasHeader = title || action;
  return (
    <section id={id} className={`surface-card overflow-hidden ${className}`}>
      {hasHeader ? (
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-6 py-4">
          <div className="flex min-w-0 items-start gap-3">
            {Icon ? (
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                <Icon className="h-4 w-4" />
              </span>
            ) : null}
            <div className="min-w-0">
              {title ? <h3 className="text-sm font-semibold text-slate-900">{title}</h3> : null}
              {hint ? <p className="mt-0.5 text-xs text-slate-500">{hint}</p> : null}
            </div>
          </div>
          {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
        </div>
      ) : null}
      <div className={flush ? bodyClassName : `px-6 py-5 ${bodyClassName}`}>{children}</div>
    </section>
  );
}
