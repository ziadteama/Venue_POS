import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { CloseIcon } from '../dashboard/icons.jsx';

const SIZES = {
  md: 'sm:max-w-md',
  lg: 'sm:max-w-lg',
  xl: 'sm:max-w-xl',
  '2xl': 'sm:max-w-2xl',
};

/**
 * Side drawer anchored to the inline-end edge (RTL-aware). Full-width on mobile,
 * fixed width on >= sm. Use for detail panes and edit forms (progressive disclosure).
 */
export function Drawer({
  open = true,
  onClose,
  title,
  subtitle,
  icon: Icon,
  size = 'lg',
  footer,
  children,
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
    <div className="fixed inset-0 z-[80]">
      <button
        type="button"
        aria-hidden="true"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-ink-900/45 backdrop-blur-sm animate-fade-in"
      />
      <div
        role="dialog"
        aria-modal="true"
        className={`absolute inset-y-0 end-0 z-10 flex w-full ${SIZES[size] ?? SIZES.lg} animate-fade-up flex-col border-s border-slate-200 bg-surface-base shadow-elevated`}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 bg-white px-6 py-4">
          <div className="flex min-w-0 items-start gap-3">
            {Icon ? (
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
                <Icon className="h-5 w-5" />
              </span>
            ) : null}
            <div className="min-w-0">
              {title ? <h3 className="truncate text-base font-semibold text-slate-900">{title}</h3> : null}
              {subtitle ? <p className="mt-0.5 truncate text-sm text-slate-500">{subtitle}</p> : null}
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

        <div className="scrollbar-slim flex-1 overflow-y-auto px-6 py-5">{children}</div>

        {footer ? (
          <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-white px-6 py-4">
            {footer}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
