import { useMemo, useState } from 'react';
import { formatMoney } from '../utils/format.js';

function venueName(entry, language) {
  return language === 'ar' ? entry.nameAr || entry.nameEn : entry.nameEn;
}

export function CrossVenueModal({ t, language, crossVenue }) {
  const locale = language === 'ar' ? 'ar-EG' : 'en-EG';
  const {
    closeModal,
    billable,
    selected,
    toggleCheque,
    group,
    step,
    loading,
    busy,
    error,
    createGroup,
    cancelGroup,
    payGroup,
  } = crossVenue;

  const [method, setMethod] = useState('cash');
  const [tendered, setTendered] = useState('');

  const selectedTotal = useMemo(() => {
    let sum = 0;
    for (const venue of billable.venues ?? []) {
      for (const cheque of venue.cheques ?? []) {
        if (selected.has(cheque.id)) sum += Number(cheque.total ?? 0);
      }
    }
    return sum;
  }, [billable, selected]);

  const combinedTotal = group?.combinedTotal ?? selectedTotal;
  const hasVenues = (billable.venues ?? []).some((v) => v.cheques?.length);

  async function handlePay() {
    const tenderedNum = tendered ? Number(tendered) : undefined;
    await payGroup({ method, tendered: method === 'cash' ? tenderedNum : undefined });
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-900/50 p-4">
      <div className="mx-auto flex h-full w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        <header className="flex shrink-0 items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{t('crossVenue.title')}</h2>
            <p className="text-sm text-secondary">{t('crossVenue.subtitle')}</p>
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
          <div className="mx-5 mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {step === 'done' ? (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
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
          ) : step === 'pay' && group ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-200">
                {group.cheques.map((cheque) => (
                  <div
                    key={cheque.id}
                    className="flex items-center justify-between border-b border-slate-100 px-4 py-3 text-sm last:border-b-0"
                  >
                    <span className="font-medium text-slate-800">
                      {cheque.venueNameEn} · {t('pos.chequeNumber', { number: cheque.chequeNumber })}
                    </span>
                    <span>
                      {formatMoney(cheque.total, locale)} {t('pos.currency')}
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
            </div>
          ) : loading ? (
            <p className="py-10 text-center text-sm text-secondary">{t('common.loading')}</p>
          ) : !hasVenues ? (
            <p className="py-10 text-center text-sm text-secondary">{t('crossVenue.empty')}</p>
          ) : (
            <div className="space-y-5">
              {billable.venues.map((venue) => (
                <div key={venue.venueId}>
                  <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-secondary">
                    {venueName(venue, language)}
                  </h3>
                  <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                    {venue.cheques.map((cheque) => {
                      const isSelected = selected.has(cheque.id);
                      return (
                        <li key={cheque.id}>
                          <button
                            type="button"
                            onClick={() => toggleCheque(cheque.id)}
                            className={`flex w-full items-center justify-between px-4 py-3 text-start text-sm hover:bg-slate-50 ${
                              isSelected ? 'bg-blue-50' : ''
                            }`}
                          >
                            <span className="flex items-center gap-3">
                              <span
                                className={`flex h-5 w-5 items-center justify-center rounded border text-xs ${
                                  isSelected
                                    ? 'border-primary-to bg-primary-to text-white'
                                    : 'border-slate-300'
                                }`}
                              >
                                {isSelected ? '✓' : ''}
                              </span>
                              <span className="font-medium text-slate-800">
                                {t('pos.tableLabel')} {cheque.tableLabel} ·{' '}
                                {t('pos.chequeNumber', { number: cheque.chequeNumber })}
                              </span>
                            </span>
                            <span>
                              {formatMoney(cheque.total, locale)} {t('pos.currency')}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>

        {step === 'select' && hasVenues ? (
          <footer className="flex shrink-0 items-center justify-between border-t border-slate-200 px-5 py-4">
            <span className="text-sm font-semibold text-slate-800">
              {t('crossVenue.combinedTotal')}: {formatMoney(selectedTotal, locale)}{' '}
              {t('pos.currency')}
            </span>
            <button
              type="button"
              disabled={selected.size === 0 || busy}
              onClick={createGroup}
              className="rounded-lg bg-primary-to px-5 py-2 text-sm font-semibold text-white disabled:opacity-40"
            >
              {t('crossVenue.combine', { count: selected.size })}
            </button>
          </footer>
        ) : null}

        {step === 'pay' && group ? (
          <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-200 px-5 py-4">
            <button
              type="button"
              disabled={busy}
              onClick={cancelGroup}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-40"
            >
              {t('crossVenue.back')}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={handlePay}
              className="rounded-lg bg-green-600 px-5 py-2 text-sm font-semibold text-white disabled:opacity-40"
            >
              {t('crossVenue.payNow', {
                total: formatMoney(combinedTotal, locale),
                currency: t('pos.currency'),
              })}
            </button>
          </footer>
        ) : null}
      </div>
    </div>
  );
}
