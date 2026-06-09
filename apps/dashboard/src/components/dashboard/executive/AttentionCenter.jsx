import { AlertIcon, CheckCircleIcon } from '../icons.jsx';

const TONE_STYLES = {
  red: 'border-red-200/80 bg-gradient-to-br from-red-50 to-white ring-red-100',
  amber: 'border-amber-200/80 bg-gradient-to-br from-amber-50 to-white ring-amber-100',
  blue: 'border-blue-200/80 bg-gradient-to-br from-blue-50 to-white ring-blue-100',
  slate: 'border-slate-200/80 bg-gradient-to-br from-slate-50 to-white ring-slate-100',
};

const ICON_TONES = {
  red: 'text-red-500',
  amber: 'text-amber-500',
  blue: 'text-blue-500',
  slate: 'text-slate-400',
};

export function AttentionCenter({ id, items, t }) {
  const hasItems = items?.length > 0;

  return (
    <section
      id={id}
      className={`relative overflow-hidden rounded-3xl border shadow-card ring-1 ${
        hasItems
          ? 'border-red-200/60 bg-gradient-to-br from-red-50/80 via-white to-amber-50/40 ring-red-100/80'
          : 'border-slate-200/70 bg-white ring-slate-100'
      }`}
    >
      <div className="absolute inset-0 bg-hero-glow opacity-60" aria-hidden="true" />
      <div className="relative px-6 py-5 sm:px-8">
        <div className="flex items-start gap-3">
          <span
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ring-1 ${
              hasItems ? 'bg-red-100 text-red-600 ring-red-200' : 'bg-accent-50 text-accent-600 ring-accent-100'
            }`}
          >
            {hasItems ? <AlertIcon className="h-5 w-5" /> : <CheckCircleIcon className="h-5 w-5" />}
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold tracking-tight text-slate-900">
              {t('dashboard.attentionTitle')}
            </h2>
            <p className="mt-0.5 text-sm text-slate-500">{t('dashboard.attentionHint')}</p>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {hasItems ? (
            items.map((item) => (
              <div
                key={item.id}
                className={`flex items-start gap-3 rounded-2xl border p-4 ring-1 ${TONE_STYLES[item.tone] ?? TONE_STYLES.slate}`}
              >
                <AlertIcon className={`mt-0.5 h-5 w-5 shrink-0 ${ICON_TONES[item.tone] ?? ICON_TONES.slate}`} />
                <p className="text-sm font-medium leading-snug text-slate-800">
                  {t(item.messageKey, item.params ?? {})}
                </p>
              </div>
            ))
          ) : (
            <div className="sm:col-span-2 rounded-2xl border border-dashed border-slate-200 bg-white/70 px-4 py-6 text-center">
              <p className="text-sm font-semibold text-slate-700">{t('dashboard.allClear')}</p>
              <p className="mt-1 text-xs text-slate-500">{t('dashboard.allClearHint')}</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
