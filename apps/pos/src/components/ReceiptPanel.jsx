import { firedOrders } from '../utils/cheque.js';
import { displayInitial, lineTotal, modifierLabel } from '../utils/orderLine.js';
import { ClearIcon, PrinterIcon } from './icons.jsx';

function ReceiptLine({ line, language, readOnly, onChangeQty, order, t }) {
  return (
    <li className="flex gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary-gradient text-sm font-bold text-white">
        {displayInitial(language === 'ar' ? line.nameAr : line.nameEn)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex justify-between gap-2">
          <span className="truncate font-medium text-slate-900">
            {language === 'ar' ? line.nameAr : line.nameEn}
            {line.isComped ? ` (${t('pos.comped')})` : ''}
          </span>
          <span className="shrink-0 font-semibold text-primary-to">
            {line.isComped ? '0.00' : lineTotal(line).toFixed(2)}
          </span>
        </div>
        {modifierLabel(line, language) && (
          <p className="mt-0.5 truncate text-xs text-secondary">{modifierLabel(line, language)}</p>
        )}
        {!readOnly && order?.status === 'draft' && (
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={() => onChangeQty(line.id, line.quantity - 1)}
              className="flex h-7 w-7 items-center justify-center rounded border border-secondary/40 bg-white text-slate-700"
            >
              −
            </button>
            <span className="min-w-[1.25rem] text-center text-sm font-medium">{line.quantity}</span>
            <button
              type="button"
              onClick={() => onChangeQty(line.id, line.quantity + 1)}
              className="flex h-7 w-7 items-center justify-center rounded border border-secondary/40 bg-white text-slate-700"
            >
              +
            </button>
          </div>
        )}
        {readOnly && <p className="mt-1 text-xs text-secondary">× {line.quantity}</p>}
      </div>
    </li>
  );
}

export function ReceiptPanel({
  t,
  language,
  loading,
  cheque,
  order,
  tableLabel,
  printerOk,
  sending,
  paying,
  onClear,
  onSend,
  onOpenActions,
  onPay,
  payDisabled = false,
  onChangeQty,
  onPickTable,
  onEditDiscount,
}) {
  const sentRounds = firedOrders(cheque);
  const draftItems = order?.items ?? [];
  const hasReceiptLines = sentRounds.length > 0 || draftItems.length > 0;
  const hasDraftItems = draftItems.length > 0;
  const canPay = cheque && cheque.total > 0 && !hasDraftItems;
  const discountAmount = Number(cheque?.discountAmount ?? 0);

  if (!cheque) {
    return (
      <aside className="flex w-[22rem] shrink-0 flex-col border-e border-slate-200 bg-white">
        <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
          <p className="text-lg font-semibold text-slate-900">{t('pos.noTableSelected')}</p>
          <p className="mt-2 text-sm text-secondary">{t('pos.noTableSelectedHint')}</p>
          <button
            type="button"
            onClick={onPickTable}
            className="mt-5 rounded-xl bg-primary-gradient px-5 py-3 text-sm font-semibold text-white hover:opacity-90"
          >
            {t('pos.chooseTable')}
          </button>
        </div>
      </aside>
    );
  }

  return (
    <aside className="flex w-[22rem] shrink-0 flex-col border-e border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-4 py-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="font-semibold text-slate-900">{t('pos.currentOrder')}</h2>
            <button
              type="button"
              onClick={onPickTable}
              className="mt-1 text-sm font-medium text-primary-to hover:underline"
            >
              {t('pos.tableActive', { table: tableLabel || '—' })}
            </button>
          </div>
          <div className="text-end text-xs text-secondary">
            <p>{t('pos.chequeNumber', { number: cheque.chequeNumber ?? '—' })}</p>
            {order ? (
              <p>{t('pos.orderNumber', { number: order.orderNumber ?? '—' })}</p>
            ) : null}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-2">
        {loading ? (
          <p className="p-2 text-secondary">{t('common.loading')}</p>
        ) : !hasReceiptLines ? (
          <p className="p-2 text-secondary">{t('pos.emptyCart')}</p>
        ) : (
          <div className="space-y-4">
            {sentRounds.map((round) => (
              <section key={round.id}>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-secondary">
                  {t('pos.firedRound', { number: round.orderNumber })}
                </p>
                <ul className="space-y-2">
                  {round.items.map((line) => (
                    <ReceiptLine
                      key={line.id}
                      line={line}
                      language={language}
                      readOnly
                      order={round}
                      t={t}
                    />
                  ))}
                </ul>
              </section>
            ))}
            {hasDraftItems && (
              <section>
                {sentRounds.length > 0 ? (
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-secondary">
                    {t('pos.currentRound')}
                  </p>
                ) : null}
                <ul className="space-y-2">
                  {draftItems.map((line) => (
                    <ReceiptLine
                      key={line.id}
                      line={line}
                      language={language}
                      readOnly={false}
                      onChangeQty={onChangeQty}
                      order={order}
                      t={t}
                    />
                  ))}
                </ul>
              </section>
            )}
          </div>
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
          {discountAmount > 0 && (
            <button
              type="button"
              onClick={onEditDiscount}
              className="flex w-full justify-between rounded-lg px-1 py-0.5 text-amber-800 hover:bg-amber-50"
            >
              <span>{t('pos.discountApplied')}</span>
              <span>
                -{discountAmount.toFixed(2)} {t('pos.currency')}
              </span>
            </button>
          )}
          {(cheque?.serviceAmount ?? 0) > 0 && (
            <div className="flex justify-between text-secondary">
              <span>{t('pos.serviceCharge')}</span>
              <span>
                {cheque.serviceAmount.toFixed(2)} {t('pos.currency')}
              </span>
            </div>
          )}
          {(cheque?.taxAmount ?? 0) > 0 && (
            <div className="flex justify-between text-secondary">
              <span>{t('pos.tax')}</span>
              <span>
                {cheque.taxAmount.toFixed(2)} {t('pos.currency')}
              </span>
            </div>
          )}
          <div className="flex justify-between border-t border-slate-100 pt-2 text-lg font-bold text-slate-900">
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

        {hasDraftItems ? (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClear}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-secondary/50 py-3 text-sm font-medium text-secondary hover:bg-slate-50"
            >
              <ClearIcon />
              {t('pos.clear')}
            </button>
            <button
              type="button"
              onClick={onSend}
              disabled={sending}
              className="flex-[2] rounded-xl bg-primary-gradient py-3 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
            >
              {sending ? t('common.loading') : t('pos.sendKitchen')}
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            {canPay ? (
              <button
                type="button"
                onClick={onPay}
                disabled={paying || payDisabled}
                className="min-w-0 flex-1 rounded-xl bg-emerald-600 py-3.5 text-base font-bold text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                {paying
                  ? t('common.loading')
                  : t('pos.payAmount', { amount: cheque.total.toFixed(2) })}
              </button>
            ) : (
              <div className="flex-1 rounded-xl border border-dashed border-slate-200 py-3.5 text-center text-sm text-secondary">
                {t('pos.addItemsHint')}
              </div>
            )}
            <button
              type="button"
              onClick={onOpenActions}
              className="shrink-0 rounded-xl border border-slate-300 px-4 py-3.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              aria-label={t('pos.actionsTitle')}
            >
              ···
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
