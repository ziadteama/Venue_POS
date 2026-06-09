import { PrinterIcon } from './icons.jsx';
import { OverlayPortal } from './ModalFrame.jsx';

export function SplitPrintModal({ t, printing, onPrintFull, onPrintSeparate, onContinue }) {
  return (
    <OverlayPortal layer="stacked" className="fixed inset-0 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
        <h3 className="text-xl font-bold text-slate-900">{t('pos.splitPrintTitle')}</h3>
        <p className="mt-2 text-sm text-secondary">{t('pos.splitPrintHint')}</p>
        <div className="mt-5 space-y-2">
          <button
            type="button"
            disabled={printing}
            onClick={onPrintFull}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary-gradient py-3.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            <PrinterIcon className="h-4 w-4" />
            {t('pos.splitPrintFull')}
          </button>
          <button
            type="button"
            disabled={printing}
            onClick={onPrintSeparate}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white py-3.5 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-60"
          >
            <PrinterIcon className="h-4 w-4" />
            {t('pos.splitPrintSeparate')}
          </button>
          <button
            type="button"
            onClick={onContinue}
            className="w-full rounded-xl py-3 text-sm font-medium text-secondary hover:bg-slate-50"
          >
            {t('pos.splitPrintContinue')}
          </button>
        </div>
      </div>
    </OverlayPortal>
  );
}
