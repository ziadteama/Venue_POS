import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../api/client.js';
import { friendlyError } from '../utils/apiError.js';
import { managerActionMethod, managerActionPath } from '../utils/chequeActions.js';

export function useChequeManager({ user }) {
  const [venues, setVenues] = useState([]);
  const [venueId, setVenueId] = useState(user?.venueId ?? '');
  const [statusTab, setStatusTab] = useState('open');
  const [cheques, setCheques] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionTarget, setActionTarget] = useState(null);

  const [discountMode, setDiscountMode] = useState('amount');
  const [discountAmount, setDiscountAmount] = useState('');
  const [discountPercent, setDiscountPercent] = useState('');

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
    return list;
  }, [listQuery, venueId, selectedId]);

  const loadDetail = useCallback(
    async (id) => {
      if (!id) return;
      setDetail(await apiFetch(`/api/v1/manager/cheques/${id}${venueQuery}`));
    },
    [venueQuery],
  );

  useEffect(() => {
    load().catch((e) => setError(friendlyError(e)));
  }, [load]);

  useEffect(() => {
    if (selectedId) loadDetail(selectedId).catch((e) => setError(friendlyError(e)));
  }, [selectedId, loadDetail]);

  const closeAction = useCallback(() => setActionTarget(null), []);

  const runAction = useCallback(
    async (body) => {
      const target = actionTarget;
      const path = managerActionPath(target);
      if (!path) return;

      setBusy(true);
      setError('');
      try {
        await apiFetch(`${path}${venueQuery}`, {
          method: managerActionMethod(target),
          body: JSON.stringify(body),
        });
        setActionTarget(null);
        const list = await load();
        const actedId = target.chequeId;
        if (actedId && list.some((c) => c.id === actedId)) {
          await loadDetail(actedId);
        } else {
          const nextId = list[0]?.id ?? null;
          if (nextId) await loadDetail(nextId);
          else setDetail(null);
        }
      } catch (e) {
        setError(friendlyError(e));
      } finally {
        setBusy(false);
      }
    },
    [actionTarget, venueQuery, load, loadDetail],
  );

  const openDiscountRequest = useCallback((cheque, actionType = 'discount') => {
    setDiscountMode('amount');
    setDiscountAmount(
      actionType === 'discount_change' && cheque.discountAmount > 0
        ? String(cheque.discountAmount)
        : '',
    );
    setDiscountPercent('');
    setActionTarget({
      type: actionType,
      chequeId: cheque.id,
      chequeNumber: cheque.chequeNumber,
      currentDiscount: cheque.discountAmount ?? 0,
    });
  }, []);

  const openDiscountRemove = useCallback((cheque) => {
    setActionTarget({
      type: 'discount_remove',
      chequeId: cheque.id,
      chequeNumber: cheque.chequeNumber,
      currentDiscount: cheque.discountAmount ?? 0,
    });
  }, []);

  const openRefundRequest = useCallback((cheque) => {
    setActionTarget({
      type: 'refund',
      chequeId: cheque.id,
      chequeNumber: cheque.chequeNumber,
      cheque,
    });
  }, []);

  const changeTab = useCallback((tab) => {
    setStatusTab(tab);
    setSelectedId(null);
  }, []);

  const changeVenue = useCallback((id) => {
    setVenueId(id);
    setSelectedId(null);
  }, []);

  return {
    venues,
    venueId,
    statusTab,
    cheques,
    selectedId,
    setSelectedId,
    detail,
    error,
    busy,
    actionTarget,
    closeAction,
    runAction,
    openDiscountRequest,
    openDiscountRemove,
    openRefundRequest,
    changeTab,
    changeVenue,
    setActionTarget,
    discountForm: {
      mode: discountMode,
      amount: discountAmount,
      percent: discountPercent,
      setMode: setDiscountMode,
      setAmount: setDiscountAmount,
      setPercent: setDiscountPercent,
    },
  };
}
