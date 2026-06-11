import {
  displayChequeTotal,
  displayChequeLocation,
  firedOrders,
  hasOpenSplitChildren,
  isTakeawayCheque,
  parentPayableTotal,
} from '../utils/cheque.js';
import { displayInitial, lineTotal, modifierLabel } from '../utils/orderLine.js';
import { AdjustmentsIcon, ClearIcon, PrinterIcon } from './icons.jsx';
import { SplitSettlePanel } from './SplitSettlePanel.jsx';

function ReceiptLine({ line, language, readOnly, onChangeQty, order, t, venueId, editable }) {
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
        {editable && onChangeQty && (
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={() => onChangeQty(line.id, line.quantity - 1, { venueId, orderId: order?.id })}
              className="flex h-7 w-7 items-center justify-center rounded border border-secondary/40 bg-white text-slate-700"
              aria-label="-"
            >
              -
            </button>
            <span className="min-w-[1.25rem] text-center text-sm font-medium">{line.quantity}</span>
            <button
              type="button"
              onClick={() => onChangeQty(line.id, line.quantity + 1, { venueId, orderId: order?.id })}
              className="flex h-7 w-7 items-center justify-center rounded border border-secondary/40 bg-white text-slate-700"
              aria-label="+"
            >
              +
            </button>
          </div>
        )}
        {!editable && (
          <p className="mt-1 text-xs text-secondary">
            {line.quantity}x
          </p>
        )}
      </div>
    </li>
  );
}

function venueLabel(venue, language) {
  const name = language === 'ar' ? venue.nameAr || venue.nameEn : venue.nameEn;
  return name ?? 'Venue';
}

function CrossVenueReceiptBody({ group, language, t, onChangeQty }) {
  return (
    <div className="space-y-4">
      {(group.cheques ?? []).map((member) => {
        const sentRounds = firedOrders(member);
        const draftItems = member.draftOrder?.items ?? [];
        if (!sentRounds.length && !draftItems.length) return null;

        return (
          <section key={member.id}>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-primary-to">
              {venueLabel(
                { nameEn: member.venueNameEn, nameAr: member.venueNameAr },
                language,
              )}
            </p>
            {sentRounds.map((round) => (
              <div key={round.id} className="mb-3">
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-secondary">
                  {t('pos.firedRound', { number: round.orderNumber })}
                </p>
                <ul className="space-y-2">
                  {round.items.map((line) => (
                    <ReceiptLine
                      key={line.id}
                      line={line}
                      language={language}
                      readOnly={cheque?.status !== 'open'}
                      editable={cheque?.status === 'open'}
                      onChangeQty={onChangeQty}
                      order={round}
                      t={t}
                    />
                  ))}
                </ul>
              </div>
            ))}
            {draftItems.length > 0 ? (
              <div>
                {sentRounds.length > 0 ? (
                  <p className="mb-1 text-xs font-medium uppercase tracking-wide text-secondary">
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
                      editable
                      onChangeQty={onChangeQty}
                      order={member.draftOrder}
                      venueId={member.venueId}
                      t={t}
                    />
                  ))}
                </ul>
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}

export function ReceiptPanel({
  t,
  language,
  loading,
  cheque,
  crossVenueGroup,
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
  onPrintCheck,
  onPrintFullSplit,
  onChangeQty,
  onPickTable,
  onPickTakeaway,
  onEditDiscount,
  onMoveTable,
  onFreeTable,
  printing = false,
}) {
  const isCrossVenue = Boolean(crossVenueGroup?.groupId);
  const sentRounds = firedOrders(cheque);
  const draftItems = order?.items ?? [];
  const groupPending =
    (crossVenueGroup?.venues ?? []).reduce(
      (sum, v) => sum + (v.draftOrder?.items?.length ?? 0),
      0,
    ) > 0;
  const splitActive = !isCrossVenue && hasOpenSplitChildren(cheque);
  const hasReceiptLines = isCrossVenue
    ? (crossVenueGroup?.displayTotal ?? 0) > 0 || groupPending
    : sentRounds.length > 0 || draftItems.length > 0 || splitActive;
  const hasDraftItems = isCrossVenue
    ? groupPending || draftItems.length > 0
    : draftItems.length > 0;
  const displayTotal = isCrossVenue
    ? (crossVenueGroup?.displayTotal ?? crossVenueGroup?.combinedTotal ?? 0)
    : displayChequeTotal(cheque);
  const canPay = isCrossVenue
    ? (crossVenueGroup?.combinedTotal ?? 0) > 0 && !hasDraftItems
    : cheque &&
      !hasOpenSplitChildren(cheque) &&
      parentPayableTotal(cheque) > 0 &&
      !hasDraftItems;
  const payButtonAmount = isCrossVenue
    ? Number(crossVenueGroup?.combinedTotal ?? 0)
    : Number(parentPayableTotal(cheque) ?? 0);
  const discountAmount = isCrossVenue
    ? Number(crossVenueGroup?.groupDiscountTotal ?? 0)
    : Number(cheque?.discountAmount ?? 0);
  const groupDiscountPercent = crossVenueGroup?.groupDiscountPercent ?? null;
  const canPrintCheck =
    !isCrossVenue && sentRounds.length > 0 && onPrintCheck && !hasOpenSplitChildren(cheque);
  const checkPrintCount = cheque?.prePaymentCheckPrintCount ?? 0;

  if (!cheque) {
    return (
      <aside className="flex w-[22rem] shrink-0 flex-col border-e border-slate-200/70 bg-white">
        <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
          <p className="text-lg font-semibold text-slate-900">{t('pos.noTableSelected')}</p>
          <p className="mt-2 text-sm text-slate-500">{t('pos.noTableSelectedHint')}</p>
          <div className="mt-5 flex w-full max-w-xs flex-col gap-2 sm:flex-row">
            <button type="button" onClick={onPickTable} className="btn-accent flex-1 px-4 py-3">
              {t('pos.dineIn')}
            </button>
            <button
              type="button"
              onClick={onPickTakeaway}
              className="flex-1 rounded-xl border border-primary-to bg-white px-4 py-3 text-sm font-semibold text-primary-to transition hover:bg-blue-50"
            >
              {t('pos.takeAway')}
            </button>
          </div>
        </div>
      </aside>
    );
  }

  return (
    <aside className="flex w-[22rem] shrink-0 flex-col border-e border-slate-200/70 bg-white">
      <div className="border-b border-slate-200 px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
              {isCrossVenue ? t('crossVenue.combinedCart') : t('pos.currentOrder')}
            </p>
            <div className="mt-0.5 flex items-center gap-2">
              <p className="truncate text-lg font-bold text-slate-900">
                {displayChequeLocation(cheque, t)}
              </p>
              {onMoveTable &&
              cheque &&
              !cheque.parentChequeId &&
              !isCrossVenue &&
              !isTakeawayCheque(cheque) ? (
                <button
                  type="button"
                  onClick={onMoveTable}
                  title={t('pos.moveTableBtn')}
                  className="shrink-0 rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 transition hover:border-slate-300 hover:bg-white hover:text-slate-700"
                >
                  {t('pos.moveTableBtn')}
                </button>
              ) : null}
            </div>
            {isCrossVenue ? (
              <p className="mt-1 text-xs font-medium text-primary-to">{t('crossVenue.badge')}</p>
            ) : null}
          </div>
          <div className="shrink-0 rounded-lg bg-slate-50 px-2.5 py-1.5 text-end text-[11px] leading-relaxed text-secondary ring-1 ring-slate-200/80">
            <p className="font-medium text-slate-700">
              {t('pos.chequeNumber', { number: cheque.chequeNumber ?? '\u2014' })}
            </p>
            {order ? (
              <p>{t('pos.orderNumber', { number: order.orderNumber ?? '\u2014' })}</p>
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
          <>
            {splitActive ? (
              <SplitSettlePanel
                cheque={cheque}
                t={t}
                paying={paying}
                printing={printing}
                onPayGuest={(guest) => onPay(guest)}
                onPayRemainder={() => onPay(null)}
                onPrintGuest={(guest) => onPrintCheck?.(guest.id)}
                onPrintFull={() => onPrintFullSplit?.()}
              />
            ) : null}
            {isCrossVenue ? (
              <CrossVenueReceiptBody
                group={crossVenueGroup}
                language={language}
                t={t}
                onChangeQty={onChangeQty}
              />
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
                      editable
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
          </>
        )}
      </div>

      <div className="mt-auto border-t border-slate-200 p-4">
        <div className="mb-3 space-y-1 text-sm">
          {!isCrossVenue && (
            <div className="flex justify-between text-secondary">
              <span>{t('pos.roundSubtotal')}</span>
              <span>
                {order?.subtotal?.toFixed(2) ?? '0.00'} {t('pos.currency')}
              </span>
            </div>
          )}
          {isCrossVenue && (crossVenueGroup?.pendingTotal ?? 0) > 0 ? (
            <div className="flex justify-between text-secondary">
              <span>{t('crossVenue.pendingTotal')}</span>
              <span>
                {(crossVenueGroup.pendingTotal ?? 0).toFixed(2)} {t('pos.currency')}
              </span>
            </div>
          ) : null}
          {discountAmount > 0 && (
            <button
              type="button"
              onClick={onEditDiscount}
              className="flex w-full justify-between rounded-lg px-1 py-0.5 text-amber-800 hover:bg-amber-50"
            >
              <span>
                {isCrossVenue && groupDiscountPercent != null
                  ? t('crossVenue.discountApplied', { percent: groupDiscountPercent })
                  : t('pos.discountApplied')}
              </span>
              <span>
                -{discountAmount.toFixed(2)} {t('pos.currency')}
              </span>
            </button>
          )}
          {!isCrossVenue && (cheque?.serviceAmount ?? 0) > 0 && (
            <div className="flex justify-between text-secondary">
              <span>{t('pos.serviceCharge')}</span>
              <span>
                {cheque.serviceAmount.toFixed(2)} {t('pos.currency')}
              </span>
            </div>
          )}
          {!isCrossVenue && (cheque?.taxAmount ?? 0) > 0 && (
            <div className="flex justify-between text-secondary">
              <span>{t('pos.tax')}</span>
              <span>
                {cheque.taxAmount.toFixed(2)} {t('pos.currency')}
              </span>
            </div>
          )}
          <div className="flex justify-between border-t border-slate-100 pt-2 text-lg font-bold text-slate-900">
            <span>{isCrossVenue ? t('crossVenue.combinedTotal') : t('pos.chequeTotal')}</span>
            <span className="text-primary-to">
              {displayTotal.toFixed(2)} {t('pos.currency')}
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
          <div className="mb-2 flex gap-2">
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
        ) : null}
        <div className="space-y-2">
            {canPrintCheck ? (
              <>
                {checkPrintCount > 0 ? (
                  <p className="text-center text-xs text-secondary">
                    {t('pos.checkPrintedCount', { count: checkPrintCount })}
                  </p>
                ) : null}
                <button
                  type="button"
                  disabled={printing || !printerOk}
                  onClick={() => onPrintCheck(cheque.id)}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                >
                  <PrinterIcon className="h-4 w-4" />
                  {checkPrintCount > 0 ? t('pos.reprintCheck') : t('pos.printCheck')}
                </button>
              </>
            ) : null}
            {canPay ? (
              <button
                type="button"
                onClick={() => onPay(null)}
                disabled={paying || payDisabled}
                className="w-full rounded-xl bg-accent-gradient py-3.5 text-base font-bold text-white shadow-sm transition duration-200 ease-premium hover:shadow-card-hover hover:brightness-[1.04] disabled:opacity-60"
              >
                {paying
                  ? t('common.loading')
                  : t('pos.payAmount', { amount: payButtonAmount.toFixed(2) })}
              </button>
            ) : !hasReceiptLines &&
              onFreeTable &&
              !cheque?.parentChequeId &&
              !isTakeawayCheque(cheque) ? (
              <button
                type="button"
                onClick={onFreeTable}
                className="w-full rounded-xl bg-emerald-500 py-3.5 text-base font-bold text-white shadow-sm transition hover:bg-emerald-600 active:scale-95"
              >
                {t('pos.freeTable')}
              </button>
            ) : !hasOpenSplitChildren(cheque) && !hasDraftItems ? (
              <div className="rounded-xl border border-dashed border-slate-200 py-3.5 text-center text-sm text-secondary">
                {t('pos.addItemsHint')}
              </div>
            ) : null}
            <button
              type="button"
              onClick={onOpenActions}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-white"
            >
              <AdjustmentsIcon />
              {t('pos.actionsTitle')}
            </button>
          </div>
      </div>
    </aside>
  );
}
