import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { CloseIcon } from '../dashboard/icons.jsx';

const SIZES = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-2xl',
};

/**
 * Standard centered modal. Provides backdrop + blur, escape-to-close,
 * a header (title/subtitle + close), an optional error alert, body, and footer.
 */
export function Modal({
  open = true,
  onClose,
  title,
  subtitle,
  icon: Icon,
  size = 'md',
  error,
  footer,
  children,
  closeOnBackdrop = true,
  className = '',
}) {
  useEffect(() => {
    if (!open) return undefined;
    function onKey(e) {
      if (e.key === 'Escape') onClose?.();
    }
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <button
        type="button"
        aria-hidden="true"
        tabIndex={-1}
        onClick={() => closeOnBackdrop && onClose?.()}
        className="absolute inset-0 cursor-default bg-ink-900/45 backdrop-blur-sm animate-fade-in"
      />
      <div
        role="dialog"
        aria-modal="true"
        className={`relative w-full animate-fade-up rounded-2xl border border-slate-200/80 bg-white shadow-elevated ${
          SIZES[size] ?? SIZES.md
        } ${className}`}
      >
        {(title || onClose) && (
          <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-6 py-4">
            <div className="flex min-w-0 items-start gap-3">
              {Icon ? (
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
                  <Icon className="h-5 w-5" />
                </span>
              ) : null}
              <div className="min-w-0">
                {title ? <h3 className="text-base font-semibold text-slate-900">{title}</h3> : null}
                {subtitle ? <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p> : null}
              </div>
            </div>
            {onClose ? (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="-me-1.5 -mt-1 rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
              >
                <CloseIcon className="h-5 w-5" />
              </button>
            ) : null}
          </div>
        )}

        <div className="px-6 py-5">
          {error ? (
            <div
              role="alert"
              className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm font-medium text-red-700"
            >
              {error}
            </div>
          ) : null}
          {children}
        </div>

        {footer ? (
          <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/60 px-6 py-4">
            {footer}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
