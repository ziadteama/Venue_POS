import { MODAL_Z } from '@venue-pos/shared';

export function ModalShell({ children, layer = 'stacked', error }) {
  const z = MODAL_Z[layer] ?? MODAL_Z.stacked;

  return (
    <div
      className="fixed inset-0 flex items-center justify-center bg-slate-900/40 p-4"
      style={{ zIndex: z }}
    >
      <div className="relative w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
        {error ? (
          <div
            role="alert"
            className="relative z-20 mb-3 rounded-lg border border-red-300 bg-red-50 px-3 py-2.5 text-sm font-medium text-red-800"
          >
            {error}
          </div>
        ) : null}
        {children}
      </div>
    </div>
  );
}
