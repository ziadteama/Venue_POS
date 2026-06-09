export function PageHeader({ title, subtitle, actions, meta, eyebrow }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        {eyebrow ? (
          <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-accent-600">
            {eyebrow}
          </p>
        ) : null}
        <h2 className="text-[1.6rem] font-bold leading-tight tracking-tight text-slate-900">
          {title}
        </h2>
        {subtitle ? <p className="mt-1.5 max-w-2xl text-sm text-slate-500">{subtitle}</p> : null}
        {meta ? <p className="mt-2 text-xs font-medium text-slate-400">{meta}</p> : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}
