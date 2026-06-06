import { canSplitByAmount, splittableItems, transferableItems } from '../utils/cheque.js';
import { displayInitial, itemName, lineTotal, modifierLabel } from '../utils/orderLine.js';
import { ClearIcon, PrinterIcon } from './icons.jsx';

export function ReceiptPanel({
  t,
  language,
  loading,
  cheque,
  order,
  openCheques,
  printerOk,
  sending,
  paying,
  onSwitchCheque,
  onClear,
  onSend,
  onSplit,
  onSplitAmount,
  onTransfer,
  lineTransferEnabled,
  onPay,
  onChangeQty,
}) {
  return (
    <aside className="flex w-[22rem] shrink-0 flex-col border-e border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-4 py-3">
        <h2 className="font-semibold text-slate-900">{t('pos.currentOrder')}</h2>
        {openCheques.length > 0 && (
          <div className="mt-2 flex gap-1 overflow-x-auto pb-1">
            {openCheques.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => onSwitchCheque(tab)}
                className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
                  cheque?.id === tab.id
                    ? 'bg-primary-gradient text-white'
                    : 'bg-slate-100 text-secondary hover:bg-slate-200'
                }`}
              >
                {tab.splitLabel || tab.tableLabel} · {tab.total.toFixed(0)}
              </button>
            ))}
          </div>
        )}
        <p className="text-sm text-secondary">
          {cheque
            ? t('pos.chequeNumber', { number: cheque.chequeNumber ?? '—' })
            : t('pos.noActiveCheque')}
        </p>
        {order && (
          <p className="text-xs text-secondary">
            {t('pos.orderNumber', { number: order.orderNumber ?? '—' })}
          </p>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-2">
        {loading ? (
          <p className="p-2 text-secondary">{t('common.loading')}</p>
        ) : !order?.items?.length ? (
          <p className="p-2 text-secondary">{t('pos.emptyCart')}</p>
        ) : (
          <ul className="space-y-2">
            {order.items.map((line) => (
              <li
                key={line.id}
                className="flex gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3"
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary-gradient text-sm font-bold text-white">
                  {displayInitial(language === 'ar' ? line.nameAr : line.nameEn)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex justify-between gap-2">
                    <span className="truncate font-medium text-slate-900">
                      {language === 'ar' ? line.nameAr : line.nameEn}
                    </span>
                    <span className="shrink-0 font-semibold text-primary-to">
                      {lineTotal(line).toFixed(2)}
                    </span>
                  </div>
                  {modifierLabel(line, language) && (
                    <p className="mt-0.5 truncate text-xs text-secondary">
                      {modifierLabel(line, language)}
                    </p>
                  )}
                  {order.status === 'draft' && (
                    <div className="mt-2 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onChangeQty(line.id, line.quantity - 1)}
                        className="flex h-7 w-7 items-center justify-center rounded border border-secondary/40 bg-white text-slate-700"
                      >
                        −
                      </button>
                      <span className="min-w-[1.25rem] text-center text-sm font-medium">
                        {line.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => onChangeQty(line.id, line.quantity + 1)}
                        className="flex h-7 w-7 items-center justify-center rounded border border-secondary/40 bg-white text-slate-700"
                      >
                        +
                      </button>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-auto border-t border-slate-200 p-4">
        <div className="mb-3 space-y-1 text-sm">
          <div className="flex justify-between text-secondary">
            <span>{t('pos.roundSubtotal')}</span>
            <span>
              {order?.subtotal?.toFixed(2) ?? '0.00'} {t('pos.currency')}
            </span>
          </div>
          <div className="flex justify-between text-lg font-bold text-slate-900">
            <span>{t('pos.chequeTotal')}</span>
            <span className="text-primary-to">
              {cheque?.total?.toFixed(2) ?? '0.00'} {t('pos.currency')}
            </span>
          </div>
        </div>

        <div
          className={`mb-3 flex items-center gap-2 text-xs ${
            printerOk ? 'text-primary-to' : 'text-red-600'
          }`}
        >
          <PrinterIcon />
          <span>{printerOk ? t('pos.printerConnected') : t('pos.printerOffline')}</span>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClear}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-secondary/50 py-3 text-sm font-medium text-secondary hover:bg-slate-50"
            >
              <ClearIcon />
              {t('pos.clear')}
            </button>
            {order?.status === 'draft' && order.items?.length > 0 && (
              <button
                type="button"
                onClick={onSend}
                disabled={sending}
                className="flex-[2] rounded-lg bg-primary-gradient py-3 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
              >
                {sending ? t('common.loading') : t('pos.sendKitchen')}
              </button>
            )}
          </div>
          {!cheque?.parentChequeId && !order?.items?.length && (
            <>
              {splittableItems(cheque).length >= 2 && (
                <button
                  type="button"
                  onClick={onSplit}
                  className="w-full rounded-lg border border-primary-to py-3 text-sm font-semibold text-primary-to hover:bg-slate-50"
                >
                  {t('pos.splitBill')}
                </button>
              )}
              {canSplitByAmount(cheque) && (
                <button
                  type="button"
                  onClick={onSplitAmount}
                  className="w-full rounded-lg border border-primary-to py-3 text-sm font-semibold text-primary-to hover:bg-slate-50"
                >
                  {t('pos.splitByAmount')}
                </button>
              )}
              {lineTransferEnabled && transferableItems(cheque).length > 0 && (
                <button
                  type="button"
                  onClick={onTransfer}
                  className="w-full rounded-lg border border-slate-400 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  {t('pos.transferLines')}
                </button>
              )}
            </>
          )}
          {cheque && cheque.total > 0 && !order?.items?.length && (
            <button
              type="button"
              onClick={onPay}
              disabled={paying}
              className="w-full rounded-lg bg-emerald-600 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              {paying ? t('common.loading') : t('pos.pay')}
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
