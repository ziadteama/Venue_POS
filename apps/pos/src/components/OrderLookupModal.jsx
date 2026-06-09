import { formatDateTime, formatMoney, itemLabel, lineItemTotal } from '../utils/format.js';
import { parseApiError } from '../utils/apiError.js';
import { MODAL_Z } from '@venue-pos/shared';

export function OrderLookupModal({
  t,
  language,
  lookup,
}) {
  const locale = language === 'ar' ? 'ar-EG' : 'en-EG';
  const {
    closeLookup,
    q,
    setQ,
    chequeNumber,
    setChequeNumber,
    tableLabel,
    setTableLabel,
    page,
    setPage,
    result,
    selectedChequeId,
    setSelectedChequeId,
    detail,
    receipt,
    loading,
    error,
    resetSearch,
    reprintOrder,
    reprintCheque,
  } = lookup;

  const chequeOrders = detail?.chequeOrders ?? (detail?.items ? [detail] : []);

  return (
    <div
      className="fixed inset-0 flex flex-col bg-slate-900/50 p-4"
      style={{ zIndex: MODAL_Z.stacked }}
    >
      <div className="mx-auto flex h-full w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        {error ? (
          <div
            role="alert"
            className="relative z-20 shrink-0 border-b border-red-300 bg-red-50 px-5 py-2.5 text-sm font-medium text-red-800"
          >
            {error}
          </div>
        ) : null}
        <header className="flex shrink-0 items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{t('pos.orderLookupTitle')}</h2>
            <p className="text-sm text-secondary">{t('pos.orderLookupSubtitle')}</p>
          </div>
          <button
            type="button"
            onClick={closeLookup}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50"
          >
            {t('common.cancel')}
          </button>
        </header>

        <div className="grid shrink-0 gap-3 border-b border-slate-100 px-5 py-4 md:grid-cols-4">
          <input
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            placeholder={t('pos.orderLookupSearch')}
            value={q}
            onChange={(e) => {
              setPage(1);
              setQ(e.target.value);
            }}
          />
          <input
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            placeholder={t('pos.orderLookupCheque')}
            value={chequeNumber}
            onChange={(e) => {
              setPage(1);
              setChequeNumber(e.target.value);
            }}
          />
          <input
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            placeholder={t('pos.orderLookupTable')}
            value={tableLabel}
            onChange={(e) => {
              setPage(1);
              setTableLabel(e.target.value);
            }}
          />
          <button
            type="button"
            onClick={resetSearch}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50"
          >
            {t('pos.orderLookupReset')}
          </button>
        </div>

        <div className="grid min-h-0 flex-1 gap-0 md:grid-cols-[1fr_20rem]">
          <section className="min-h-0 overflow-y-auto border-r border-slate-100">
            {loading && !result ? (
              <p className="p-5 text-sm text-secondary">{t('common.loading')}</p>
            ) : result?.cheques?.length ? (
              <>
                <ul className="divide-y divide-slate-100">
                  {result.cheques.map((group) => {
                    const key = group.chequeId ?? `orphan:${group.orders[0]?.id}`;
                    const selected = selectedChequeId === key;
                    return (
                      <li key={key}>
                        <button
                          type="button"
                          onClick={() => setSelectedChequeId(key)}
                          className={`w-full px-5 py-3 text-start text-sm hover:bg-slate-50 ${
                            selected ? 'bg-blue-50' : ''
                          }`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <span className="font-medium text-slate-900">
                              {group.chequeNumber != null
                                ? t('pos.chequeNumber', { number: group.chequeNumber })
                                : t('pos.orderLookupNoCheque')}
                            </span>
                            <span>
                              {formatMoney(group.totalSubtotal, locale)} {t('pos.currency')}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-secondary">
                            {group.tableLabel || '-'} | {group.orderCount}{' '}
                            {t('pos.orderLookupRounds')}
                          </p>
                        </button>
                      </li>
                    );
                  })}
                </ul>
                <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3 text-sm">
                  <span className="text-secondary">
                    {t('pos.orderLookupPage', {
                      page: result.page,
                      totalPages: result.totalPages,
                    })}
                  </span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      className="rounded border px-3 py-1 disabled:opacity-40"
                    >
                      {t('pos.orderLookupPrev')}
                    </button>
                    <button
                      type="button"
                      disabled={page >= result.totalPages}
                      onClick={() => setPage((p) => p + 1)}
                      className="rounded border px-3 py-1 disabled:opacity-40"
                    >
                      {t('pos.orderLookupNext')}
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <p className="p-5 text-sm text-secondary">{t('pos.orderLookupEmpty')}</p>
            )}
          </section>

          <aside className="min-h-0 overflow-y-auto p-4 text-sm">
            {!detail ? (
              <p className="text-secondary">{t('pos.orderLookupSelect')}</p>
            ) : (
              <div className="space-y-4">
                <div>
                  <h3 className="font-semibold text-slate-900">
                    {detail.cheque?.chequeNumber != null
                      ? t('pos.chequeNumber', { number: detail.cheque.chequeNumber })
                      : t('pos.orderLookupDetail')}
                  </h3>
                  <p className="text-secondary">{formatDateTime(detail.openedAt, locale)}</p>
                </div>

                {detail.cheque?.payments?.length > 0 ? (
                  <div>
                    <p className="font-medium">{t('pos.orderLookupPayments')}</p>
                    <ul className="mt-1 space-y-1 text-secondary">
                      {detail.cheque.payments.map((p) => (
                        <li key={p.id}>
                          {p.method} - {formatMoney(p.amount, locale)} {t('pos.currency')}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                <div className="space-y-3">
                  {chequeOrders.map((order) => (
                    <div key={order.id} className="rounded-lg border border-slate-200 p-3">
                      <div className="mb-2 flex justify-between gap-2 font-medium">
                        <span>{t('pos.orderNumber', { number: order.orderNumber })}</span>
                        <span className="text-secondary">
                          {formatMoney(order.subtotal, locale)} {t('pos.currency')}
                        </span>
                      </div>
                      <ul className="space-y-1 text-secondary">
                        {order.items.map((item) => (
                          <li key={item.id} className="flex justify-between gap-2">
                            <span>
                              {item.quantity}x {itemLabel(item, language)}
                            </span>
                            <span>
                              {formatMoney(lineItemTotal(item), locale)}
                            </span>
                          </li>
                        ))}
                      </ul>
                      <button
                        type="button"
                        onClick={() =>
                          reprintOrder(order.id).catch((e) =>
                            lookup.setError(parseApiError(e?.message ?? e)),
                          )
                        }
                        className="mt-2 text-xs text-primary-to hover:underline"
                      >
                        {t('pos.orderLookupReprintOrder')}
                      </button>
                    </div>
                  ))}
                </div>

                {detail.cheque?.id ? (
                  <button
                    type="button"
                    onClick={() =>
                      reprintCheque(detail.cheque.id).catch((e) =>
                        lookup.setError(parseApiError(e?.message ?? e)),
                      )
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 hover:bg-slate-50"
                  >
                    {t('pos.orderLookupReprintCheque')}
                  </button>
                ) : null}

                {receipt ? (
                  <pre className="max-h-48 overflow-auto rounded border border-slate-200 bg-slate-50 p-3 text-xs whitespace-pre-wrap">
                    {receipt}
                  </pre>
                ) : null}
              </div>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}
