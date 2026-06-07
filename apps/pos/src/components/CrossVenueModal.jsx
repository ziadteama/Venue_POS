import { useMemo, useState } from 'react';
import { MenuGrid } from './MenuGrid.jsx';
import { formatMoney } from '../utils/format.js';
import { itemName, lineTotal, modifierLabel } from '../utils/orderLine.js';

function venueLabel(venue, language) {
  return language === 'ar' ? venue.nameAr || venue.nameEn : venue.nameEn;
}

export function CrossVenueModal({ t, language, crossVenue, features }) {
  const locale = language === 'ar' ? 'ar-EG' : 'en-EG';
  const {
    closeModal,
    group,
    venues,
    activeVenueId,
    selectVenue,
    menu,
    menuLoading,
    activeCategoryId,
    setActiveCategoryId,
    displayItems,
    draftOrderStub,
    step,
    busy,
    error,
    addItem,
    changeQty,
    fireAll,
    goToPay,
    backToOrder,
    payGroup,
  } = crossVenue;

  const [method, setMethod] = useState('cash');
  const [tendered, setTendered] = useState('');

  const activeVenue = venues.find((v) => v.id === activeVenueId);
  const combinedTotal = group?.combinedTotal ?? 0;
  const pendingTotal = group?.pendingTotal ?? 0;
  const displayTotal = group?.displayTotal ?? 0;
  const canFire = pendingTotal > 0;
  const canPay = combinedTotal > 0 && pendingTotal === 0;

  const cartVenues = useMemo(() => {
    return (group?.venues ?? []).filter((v) => v.draftOrder?.items?.length);
  }, [group]);

  async function handlePay() {
    const tenderedNum = tendered ? Number(tendered) : undefined;
    await payGroup({ method, tendered: method === 'cash' ? tenderedNum : undefined });
  }

  if (!group && busy) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
        <p className="rounded-xl bg-white px-6 py-4 text-sm text-secondary">{t('common.loading')}</p>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-100">
      <header className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 py-3 sm:px-5">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">{t('crossVenue.orderTitle')}</h2>
          <p className="text-sm text-secondary">
            {group?.tableLabel
              ? t('crossVenue.orderForTable', { table: group.tableLabel })
              : t('crossVenue.orderSubtitle')}
          </p>
        </div>
        <button
          type="button"
          onClick={closeModal}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50"
        >
          {t('common.cancel')}
        </button>
      </header>

      {error ? (
        <div className="mx-4 mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700 sm:mx-5">
          {error}
        </div>
      ) : null}

      {step === 'done' ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-100 text-2xl text-green-700">
            ✓
          </div>
          <h3 className="text-lg font-semibold text-slate-900">{t('crossVenue.paidTitle')}</h3>
          <p className="text-sm text-secondary">
            {t('crossVenue.paidTotal', {
              total: formatMoney(combinedTotal, locale),
              currency: t('pos.currency'),
            })}
          </p>
          <button
            type="button"
            onClick={closeModal}
            className="mt-2 rounded-lg bg-primary-to px-5 py-2 text-sm font-semibold text-white"
          >
            {t('common.done')}
          </button>
        </div>
      ) : step === 'pay' ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-5">
          <div className="mx-auto w-full max-w-lg space-y-4">
            <div className="rounded-xl border border-slate-200 bg-white">
              {(group?.cheques ?? []).map((cheque) => (
                <div
                  key={cheque.id}
                  className="flex items-center justify-between border-b border-slate-100 px-4 py-3 text-sm last:border-b-0"
                >
                  <span className="font-medium text-slate-800">
                    {cheque.venueNameEn} · {t('pos.chequeNumber', { number: cheque.chequeNumber })}
                  </span>
                  <span>
                    {formatMoney(cheque.firedSubtotal ?? cheque.total, locale)} {t('pos.currency')}
                  </span>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3 text-base font-semibold">
              <span>{t('crossVenue.combinedTotal')}</span>
              <span>
                {formatMoney(combinedTotal, locale)} {t('pos.currency')}
              </span>
            </div>

            <div className="flex gap-2">
              {['cash', 'card', 'voucher'].map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMethod(m)}
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${
                    method === m
                      ? 'border-primary-to bg-blue-50 text-primary-to'
                      : 'border-slate-300 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {t(`pos.method_${m}`)}
                </button>
              ))}
            </div>

            {method === 'cash' ? (
              <input
                type="number"
                inputMode="decimal"
                value={tendered}
                onChange={(e) => setTendered(e.target.value)}
                placeholder={t('crossVenue.tendered')}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            ) : null}

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                disabled={busy}
                onClick={backToOrder}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-40"
              >
                {t('crossVenue.back')}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={handlePay}
                className="flex-1 rounded-lg bg-green-600 px-5 py-2 text-sm font-semibold text-white disabled:opacity-40"
              >
                {t('crossVenue.payNow', {
                  total: formatMoney(combinedTotal, locale),
                  currency: t('pos.currency'),
                })}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="flex shrink-0 gap-2 overflow-x-auto border-b border-slate-200 bg-white px-4 py-2">
            {venues.map((venue) => {
              const isHome = venue.id === features?.anchorVenue?.id;
              const isActive = venue.id === activeVenueId;
              const venueCart = group?.venues?.find((v) => v.venueId === venue.id);
              const itemCount = venueCart?.draftOrder?.items?.length ?? 0;
              return (
                <button
                  key={venue.id}
                  type="button"
                  onClick={() => selectVenue(venue.id)}
                  className={`shrink-0 rounded-lg px-4 py-2 text-sm font-medium ${
                    isActive
                      ? 'bg-primary-gradient text-white shadow-sm'
                      : 'bg-slate-50 text-secondary hover:bg-slate-100'
                  }`}
                >
                  {isHome ? t('crossVenue.homeVenue', { venue: venueLabel(venue, language) }) : venueLabel(venue, language)}
                  {itemCount > 0 ? ` (${itemCount})` : ''}
                </button>
              );
            })}
          </div>

          {activeVenue ? (
            <p className="shrink-0 bg-white px-4 py-2 text-sm text-secondary border-b border-slate-100">
              {t('crossVenue.orderForVenue', { venue: venueLabel(activeVenue, language) })}
            </p>
          ) : null}

          <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
            <MenuGrid
              t={t}
              language={language}
              loading={menuLoading || busy}
              menu={menu}
              activeCategoryId={activeCategoryId}
              onCategoryChange={setActiveCategoryId}
              displayItems={displayItems}
              order={draftOrderStub}
              onTapItem={addItem}
            />

            <aside className="flex w-full shrink-0 flex-col border-t border-slate-200 bg-white lg:w-80 lg:border-t-0 lg:border-s border-slate-200">
              <div className="border-b border-slate-100 px-4 py-3">
                <h3 className="text-sm font-semibold text-slate-900">{t('crossVenue.combinedCart')}</h3>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
                {!cartVenues.length ? (
                  <p className="text-sm text-secondary">{t('crossVenue.cartEmpty')}</p>
                ) : (
                  <div className="space-y-4">
                    {cartVenues.map((venueEntry) => (
                      <div key={venueEntry.venueId}>
                        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-secondary">
                          {venueLabel(
                            venues.find((v) => v.id === venueEntry.venueId) ?? {
                              nameEn: venueEntry.nameEn,
                              nameAr: venueEntry.nameAr,
                            },
                            language,
                          )}
                        </h4>
                        <ul className="space-y-2">
                          {venueEntry.draftOrder.items.map((line) => (
                            <li
                              key={line.id}
                              className="flex items-start justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm"
                            >
                              <div className="min-w-0">
                                <p className="font-medium text-slate-800">
                                  {itemName(line.menuItem ?? line, language)}
                                </p>
                                {modifierLabel(line, language) ? (
                                  <p className="text-xs text-secondary">{modifierLabel(line, language)}</p>
                                ) : null}
                                <div className="mt-1 flex items-center gap-2">
                                  <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() =>
                                      changeQty(venueEntry.venueId, line.id, line.quantity - 1)
                                    }
                                    className="h-7 w-7 rounded border border-slate-300 text-sm disabled:opacity-40"
                                  >
                                    −
                                  </button>
                                  <span className="w-6 text-center font-medium">{line.quantity}</span>
                                  <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() =>
                                      changeQty(venueEntry.venueId, line.id, line.quantity + 1)
                                    }
                                    className="h-7 w-7 rounded border border-slate-300 text-sm disabled:opacity-40"
                                  >
                                    +
                                  </button>
                                </div>
                              </div>
                              <span className="shrink-0 font-medium text-slate-700">
                                {formatMoney(lineTotal(line), locale)}
                              </span>
                            </li>
                          ))}
                        </ul>
                        <p className="mt-2 text-end text-xs font-medium text-secondary">
                          {t('crossVenue.venueSubtotal', {
                            total: formatMoney(venueEntry.pendingSubtotal ?? 0, locale),
                            currency: t('pos.currency'),
                          })}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-2 border-t border-slate-200 px-4 py-3">
                {pendingTotal > 0 ? (
                  <div className="flex justify-between text-sm text-secondary">
                    <span>{t('crossVenue.pendingTotal')}</span>
                    <span>
                      {formatMoney(pendingTotal, locale)} {t('pos.currency')}
                    </span>
                  </div>
                ) : null}
                {combinedTotal > 0 ? (
                  <div className="flex justify-between text-sm font-semibold text-slate-800">
                    <span>{t('crossVenue.firedTotal')}</span>
                    <span>
                      {formatMoney(combinedTotal, locale)} {t('pos.currency')}
                    </span>
                  </div>
                ) : null}
                <div className="flex justify-between text-base font-semibold text-slate-900">
                  <span>{t('crossVenue.combinedTotal')}</span>
                  <span>
                    {formatMoney(displayTotal, locale)} {t('pos.currency')}
                  </span>
                </div>
              </div>
            </aside>
          </div>

          <footer className="flex shrink-0 items-center justify-end gap-3 border-t border-slate-200 bg-white px-4 py-3 sm:px-5">
            <button
              type="button"
              disabled={busy || !canFire}
              onClick={fireAll}
              className="rounded-lg border border-primary-to bg-blue-50 px-5 py-2 text-sm font-semibold text-primary-to disabled:opacity-40"
            >
              {t('crossVenue.fireAll')}
            </button>
            <button
              type="button"
              disabled={busy || !canPay}
              onClick={goToPay}
              className="rounded-lg bg-green-600 px-5 py-2 text-sm font-semibold text-white disabled:opacity-40"
            >
              {t('crossVenue.proceedPay')}
            </button>
          </footer>
        </>
      )}
    </div>
  );
}
