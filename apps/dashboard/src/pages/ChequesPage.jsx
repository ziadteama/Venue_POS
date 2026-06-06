import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiFetch } from '../api/client.js';
import { useAuth } from '../hooks/useAuth.js';

function ManagerActionModal({ title, reasonLabel, confirmLabel, confirmClass, onConfirm, onCancel, t }) {
  const [pin, setPin] = useState('');
  const [reason, setReason] = useState('');

  function handleSubmit(e) {
    e.preventDefault();
    if (!pin.trim() || !reason.trim()) return;
    onConfirm({ managerPin: pin.trim(), reason: reason.trim() });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl"
      >
        <h3 className="mb-4 text-lg font-semibold text-slate-900">{title}</h3>
        <label className="mb-3 block text-sm">
          <span className="mb-1 block text-secondary">{t('cheque.managerPin')}</span>
          <input
            type="password"
            inputMode="numeric"
            maxLength={6}
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            className="w-full rounded border px-3 py-2"
            autoFocus
          />
        </label>
        <label className="mb-4 block text-sm">
          <span className="mb-1 block text-secondary">{reasonLabel}</span>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            className="w-full rounded border px-3 py-2"
          />
        </label>
        <div className="flex gap-3">
          <button
            type="submit"
            className={`rounded-lg px-4 py-2 font-medium text-white ${confirmClass}`}
          >
            {confirmLabel}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-slate-300 px-4 py-2 text-secondary hover:bg-slate-50"
          >
            {t('common.cancel')}
          </button>
        </div>
      </form>
    </div>
  );
}

export function ChequesPage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const [venues, setVenues] = useState([]);
  const [venueId, setVenueId] = useState(user?.venueId ?? '');
  const [statusTab, setStatusTab] = useState('open');
  const [cheques, setCheques] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionTarget, setActionTarget] = useState(null);

  const venueQuery = venueId ? `?venueId=${venueId}` : '';
  const listQuery = venueId
    ? `?status=${statusTab}&venueId=${venueId}`
    : `?status=${statusTab}`;

  const load = useCallback(async () => {
    setError('');
    const [list, venueList] = await Promise.all([
      apiFetch(`/api/v1/manager/cheques${listQuery}`),
      apiFetch('/api/v1/venues'),
    ]);
    setCheques(list);
    setVenues(venueList);
    if (!venueId && venueList[0]) setVenueId(venueList[0].id);
    if (!selectedId && list[0]) setSelectedId(list[0].id);
    else if (selectedId && !list.some((c) => c.id === selectedId)) {
      setSelectedId(list[0]?.id ?? null);
      setDetail(null);
    }
  }, [listQuery, venueId, selectedId]);

  const loadDetail = useCallback(
    async (id) => {
      if (!id) return;
      setDetail(await apiFetch(`/api/v1/manager/cheques/${id}${venueQuery}`));
    },
    [venueQuery],
  );

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [load]);

  useEffect(() => {
    if (selectedId) loadDetail(selectedId).catch((e) => setError(e.message));
  }, [selectedId, loadDetail]);

  async function runAction(body) {
    setBusy(true);
    setError('');
    try {
      let path;
      if (actionTarget.type === 'round') {
        path = `/api/v1/manager/cheques/${actionTarget.chequeId}/orders/${actionTarget.orderId}/void`;
      } else if (actionTarget.type === 'cheque') {
        path = `/api/v1/manager/cheques/${actionTarget.chequeId}/void`;
      } else {
        path = `/api/v1/manager/cheques/${actionTarget.chequeId}/orders/${actionTarget.orderId}/items/${actionTarget.itemId}/comp`;
      }
      await apiFetch(`${path}${venueQuery}`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setActionTarget(null);
      await load();
      if (selectedId) await loadDetail(selectedId);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const billableOrders =
    detail?.orders?.filter(
      (o) => o.status !== 'draft' && o.status !== 'voided' && o.items?.length > 0,
    ) ?? [];

  const isOpenTab = statusTab === 'open';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-xl font-semibold">{t('cheque.title')}</h2>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex rounded-lg border border-slate-200 p-0.5 text-sm">
            <button
              type="button"
              onClick={() => {
                setStatusTab('open');
                setSelectedId(null);
              }}
              className={`rounded-md px-3 py-1.5 ${
                statusTab === 'open' ? 'bg-primary-gradient text-white' : 'text-secondary'
              }`}
            >
              {t('cheque.tabOpen')}
            </button>
            <button
              type="button"
              onClick={() => {
                setStatusTab('paid');
                setSelectedId(null);
              }}
              className={`rounded-md px-3 py-1.5 ${
                statusTab === 'paid' ? 'bg-primary-gradient text-white' : 'text-secondary'
              }`}
            >
              {t('cheque.tabPaid')}
            </button>
          </div>
          {user?.role === 'hub_manager' && venues.length > 1 && (
            <select
              className="rounded border px-3 py-2 text-sm"
              value={venueId}
              onChange={(e) => {
                setVenueId(e.target.value);
                setSelectedId(null);
              }}
            >
              {venues.map((v) => (
                <option key={v.id} value={v.id}>
                  {i18n.language === 'ar' ? v.nameAr : v.nameEn}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700">
          {error}
        </div>
      )}

      {actionTarget && (
        <ManagerActionModal
          title={
            actionTarget.type === 'round'
              ? t('cheque.voidRoundTitle', { number: actionTarget.orderNumber })
              : actionTarget.type === 'cheque'
                ? t('cheque.voidChequeTitle', { number: actionTarget.chequeNumber })
                : t('cheque.compItemTitle', { name: actionTarget.itemName })
          }
          reasonLabel={
            actionTarget.type === 'comp' ? t('cheque.compReason') : t('cheque.voidReason')
          }
          confirmLabel={
            actionTarget.type === 'comp' ? t('cheque.confirmComp') : t('cheque.confirmVoid')
          }
          confirmClass={
            actionTarget.type === 'comp' ? 'bg-amber-600 hover:bg-amber-700' : 'bg-red-600 hover:bg-red-700'
          }
          t={t}
          onCancel={() => setActionTarget(null)}
          onConfirm={runAction}
        />
      )}

      <div className="grid gap-6 lg:grid-cols-[16rem_1fr]">
        <aside className="rounded-xl border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-4 py-3 font-medium">
            {statusTab === 'open' ? t('cheque.openList') : t('cheque.paidList')}
          </div>
          <ul className="max-h-[32rem] overflow-y-auto">
            {cheques.length === 0 ? (
              <li className="px-4 py-6 text-sm text-secondary">
                {statusTab === 'open' ? t('cheque.noOpen') : t('cheque.noPaid')}
              </li>
            ) : (
              cheques.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(c.id)}
                    className={`w-full border-b border-slate-100 px-4 py-3 text-start text-sm hover:bg-slate-50 ${
                      selectedId === c.id ? 'bg-primary-from/5 font-medium' : ''
                    }`}
                  >
                    <div>
                      {t('cheque.number', { number: c.chequeNumber })} —{' '}
                      {c.splitLabel ? `${c.tableLabel} (${c.splitLabel})` : c.tableLabel}
                    </div>
                    <div className="text-secondary">
                      {c.total.toFixed(2)} {t('pos.currency')}
                    </div>
                  </button>
                </li>
              ))
            )}
          </ul>
        </aside>

        <section className="rounded-xl border border-slate-200 bg-white p-4">
          {!detail ? (
            <p className="text-secondary">{t('cheque.selectCheque')}</p>
          ) : (
            <>
              <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h3 className="text-lg font-semibold">
                    {t('cheque.number', { number: detail.chequeNumber })}
                  </h3>
                  <p className="text-sm text-secondary">
                    {t('cheque.table', { label: detail.tableLabel })}
                    {detail.splitLabel ? ` · ${detail.splitLabel}` : ''} ·{' '}
                    {detail.status === 'paid' ? t('cheque.statusPaid') : t('cheque.statusOpen')}
                  </p>
                  {detail.parentCheque && (
                    <p className="text-xs text-secondary">
                      {t('cheque.splitFrom', { number: detail.parentCheque.chequeNumber })}
                    </p>
                  )}
                </div>
                <div className="text-end">
                  <p className="text-sm text-secondary">{t('cheque.total')}</p>
                  <p className="text-2xl font-bold text-primary-to">
                    {detail.total.toFixed(2)} {t('pos.currency')}
                  </p>
                </div>
              </div>

              {detail.childCheques?.length > 0 && (
                <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="mb-2 font-medium">{t('cheque.childCheques')}</p>
                  <ul className="space-y-1 text-sm">
                    {detail.childCheques.map((child) => (
                      <li key={child.id} className="flex justify-between text-secondary">
                        <span>
                          #{child.chequeNumber} — {child.splitLabel} ({child.status})
                        </span>
                        <span>
                          {child.total.toFixed(2)} {t('pos.currency')}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="mb-4 space-y-3">
                {billableOrders.map((order) => (
                  <div
                    key={order.id}
                    className="rounded-lg border border-slate-200 bg-slate-50 p-3"
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <span className="font-medium">
                        {t('pos.orderNumber', { number: order.orderNumber })} — {order.status}
                      </span>
                      <span className="font-semibold">
                        {order.subtotal.toFixed(2)} {t('pos.currency')}
                      </span>
                    </div>
                    <ul className="mb-2 space-y-1 text-sm">
                      {order.items.map((line) => (
                        <li
                          key={line.id}
                          className={`flex items-center justify-between gap-2 ${
                            line.isComped ? 'text-amber-700 line-through' : 'text-secondary'
                          }`}
                        >
                          <span>
                            {line.quantity}×{' '}
                            {i18n.language === 'ar' ? line.nameAr : line.nameEn}
                            {line.isComped ? ` (${t('cheque.comped')})` : ''}
                          </span>
                          {isOpenTab && !line.isComped && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                setActionTarget({
                                  type: 'comp',
                                  chequeId: detail.id,
                                  orderId: order.id,
                                  itemId: line.id,
                                  itemName:
                                    i18n.language === 'ar' ? line.nameAr : line.nameEn,
                                })
                              }
                              className="shrink-0 text-xs font-medium text-amber-700 hover:text-amber-800 disabled:opacity-50"
                            >
                              {t('cheque.compItem')}
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                    {isOpenTab && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          setActionTarget({
                            type: 'round',
                            chequeId: detail.id,
                            orderId: order.id,
                            orderNumber: order.orderNumber,
                          })
                        }
                        className="text-sm font-medium text-red-600 hover:text-red-700 disabled:opacity-50"
                      >
                        {t('cheque.voidRound')}
                      </button>
                    )}
                  </div>
                ))}
                {isOpenTab && detail.draftOrder?.items?.length > 0 && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                    {t('cheque.draftPending')}
                  </div>
                )}
                {detail.payments?.length > 0 && (
                  <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
                    <p className="mb-1 font-medium">{t('cheque.payments')}</p>
                    {detail.payments.map((p) => (
                      <div key={p.id} className="flex justify-between text-secondary">
                        <span>{p.method}</span>
                        <span>
                          {p.amount.toFixed(2)} {t('pos.currency')}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {isOpenTab && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    setActionTarget({
                      type: 'cheque',
                      chequeId: detail.id,
                      chequeNumber: detail.chequeNumber,
                    })
                  }
                  className="rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
                >
                  {t('cheque.voidCheque')}
                </button>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
