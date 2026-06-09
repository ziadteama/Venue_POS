import { MODAL_Z } from '@venue-pos/shared';

export function ModalFrame({ layer = 'stacked', children, className = '', align = 'center' }) {
  const alignClass =
    align === 'bottom'
      ? 'items-end justify-center sm:items-center'
      : 'items-center justify-center';

  return (
    <div
      className={`fixed inset-0 flex bg-ink-900/45 p-4 backdrop-blur-sm ${alignClass} ${className}`}
      style={{ zIndex: MODAL_Z[layer] ?? MODAL_Z.stacked }}
    >
      {children}
    </div>
  );
}

export function ModalPanel({ children, className = '', wide = false }) {
  return (
    <div
      className={`relative w-full animate-fade-up rounded-2xl border border-slate-200/80 bg-white p-6 shadow-elevated ${
        wide ? 'max-w-lg' : 'max-w-md'
      } ${className}`}
    >
      {children}
    </div>
  );
}

export function ModalErrorAlert({ error, className = '' }) {
  if (!error) return null;
  return (
    <div
      role="alert"
      className={`relative z-20 mb-3 rounded-lg border border-red-300 bg-red-50 px-3 py-2.5 text-sm font-medium text-red-800 shadow-sm ${className}`}
    >
      {error}
    </div>
  );
}
