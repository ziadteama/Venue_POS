const TONES = {
  neutral: 'bg-slate-100 text-slate-600 ring-slate-200',
  emerald: 'bg-accent-50 text-accent-700 ring-accent-200',
  red: 'bg-red-50 text-red-700 ring-red-200',
  amber: 'bg-amber-50 text-amber-800 ring-amber-200',
  blue: 'bg-blue-50 text-blue-700 ring-blue-200',
  violet: 'bg-violet-50 text-violet-700 ring-violet-200',
  indigo: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
};

export function Badge({ tone = 'neutral', children, className = '', dot = false }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${
        TONES[tone] ?? TONES.neutral
      } ${className}`}
    >
      {dot ? <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" /> : null}
      {children}
    </span>
  );
}

const STATUS_TONES = {
  open: 'emerald',
  paid: 'blue',
  voided: 'red',
  closed: 'neutral',
  draft: 'amber',
  published: 'emerald',
  archived: 'neutral',
  online: 'emerald',
  offline: 'red',
  active: 'emerald',
  inactive: 'neutral',
  pending: 'amber',
  approved: 'emerald',
  rejected: 'red',
};

/**
 * Status pill that maps a known status keyword to a tone, with an optional
 * status dot. `label` overrides the displayed text (e.g. translated).
 */
export function StatusBadge({ status, label, dot = true, className = '' }) {
  const tone = STATUS_TONES[String(status).toLowerCase()] ?? 'neutral';
  return (
    <Badge tone={tone} dot={dot} className={className}>
      {label ?? status}
    </Badge>
  );
}
