import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { MODAL_Z } from '@venue-pos/shared';

/**
 * Shared modal shell for cheque action dialogs. Visually aligned with the
 * premium `ui/Modal` primitive (backdrop blur, rounded-2xl panel, fade-up,
 * elevated shadow) while keeping the lightweight `children`/`error` API the
 * cheque modals rely on. `layer` maps to the shared MODAL_Z stacking scale.
 * Portaled to document.body so overlays sit above the fixed sidebar.
 */
export function ModalShell({ children, layer = 'stacked', error, wide = false }) {
  const z = MODAL_Z[layer] ?? MODAL_Z.stacked;

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  return createPortal(
    <div className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex: z }}>
      <div className="absolute inset-0 bg-ink-900/45 backdrop-blur-sm animate-fade-in" aria-hidden="true" />
      <div
        className={`relative w-full ${wide ? 'max-w-2xl' : 'max-w-md'} animate-fade-up rounded-2xl border border-slate-200/80 bg-white p-6 shadow-elevated`}
      >
        {error ? (
          <div
            role="alert"
            className="relative z-20 mb-4 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm font-medium text-red-700"
          >
            {error}
          </div>
        ) : null}
        {children}
      </div>
    </div>,
    document.body,
  );
}
