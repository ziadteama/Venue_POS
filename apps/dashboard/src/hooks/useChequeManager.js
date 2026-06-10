import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { apiFetch } from '../api/client.js';
import { friendlyError } from '../utils/apiError.js';
import { managerActionMethod, managerActionPath } from '../utils/chequeActions.js';

function isNumericQuery(q) {
  const trimmed = q?.trim();
  return trimmed && /^\d+$/.test(trimmed);
}

export function useChequeManager({ user }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [venues, setVenues] = useState([]);
  const [venueId, setVenueId] = useState(searchParams.get('venueId') || user?.venueId || '');
  const [shiftId, setShiftId] = useState(searchParams.get('shiftId'));
  const [shiftContext, setShiftContext] = useState(null);
  const [statusTab, setStatusTab] = useState('open');
  const [searchQ, setSearchQ] = useState('');
  const [hubSearchActive, setHubSearchActive] = useState(false);
  const [cheques, setCheques] = useState([]);
  const [selectedId, setSelectedId] = useState(searchParams.get('chequeId'));
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionTarget, setActionTarget] = useState(null);

  const [discountMode, setDiscountMode] = useState('amount');
  const [discountAmount, setDiscountAmount] = useState('');
  const [discountPercent, setDiscountPercent] = useState('');

  const syncUrl = useCallback(
    (chequeId, vId, sId = shiftId) => {
      const next = new URLSearchParams(searchParams);
      if (chequeId) next.set('chequeId', chequeId);
      else next.delete('chequeId');
      if (vId) next.set('venueId', vId);
      else next.delete('venueId');
      if (sId) next.set('shiftId', sId);
      else next.delete('shiftId');
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams, shiftId],
  );

  const loadShiftContext = useCallback(async (sId, vId) => {
    if (!sId || !vId) {
      setShiftContext(null);
      return;
    }
    try {
      const shift = await apiFetch(`/api/v1/manager/shifts/${sId}?venueId=${vId}`);
      setShiftContext(shift);
    } catch {
      setShiftContext(null);
    }
  }, []);

  const load = useCallback(async () => {
    setError('');
    const venueList = await apiFetch('/api/v1/venues');
    setVenues(venueList);

    const trimmedQ = searchQ.trim();
    const useHubSearch = isNumericQuery(trimmedQ) && user?.role === 'hub_manager';

    let list;
    if (useHubSearch) {
      const params = new URLSearchParams({ status: statusTab, q: trimmedQ });
      list = await apiFetch(`/api/v1/manager/cheques/hub-search?${params}`);
      setHubSearchActive(true);
    } else {
      const params = new URLSearchParams({ status: statusTab });
      if (venueId) params.set('venueId', venueId);
      if (trimmedQ) params.set('q', trimmedQ);
      if (shiftId) params.set('shiftId', shiftId);
      list = await apiFetch(`/api/v1/manager/cheques?${params}`);
      setHubSearchActive(false);
    }

    setCheques(list);

    if (!venueId && venueList[0] && !useHubSearch) setVenueId(venueList[0].id);

    if (!selectedId && list[0]) {
      setSelectedId(list[0].id);
      if (useHubSearch && list[0].venueId) setVenueId(list[0].venueId);
    } else if (selectedId && !list.some((c) => c.id === selectedId)) {
      setSelectedId(list[0]?.id ?? null);
      setDetail(null);
      if (list[0]?.venueId) setVenueId(list[0].venueId);
    }
    return list;
  }, [statusTab, venueId, searchQ, shiftId, selectedId, user?.role]);

  const loadDetail = useCallback(
    async (id, vId = venueId) => {
      if (!id || !vId) return;
      const q = `?venueId=${vId}`;
      setDetail(await apiFetch(`/api/v1/manager/cheques/${id}${q}`));
    },
    [venueId],
  );

  useEffect(() => {
    load().catch((e) => setError(friendlyError(e)));
  }, [load]);

  useEffect(() => {
    const urlChequeId = searchParams.get('chequeId');
    const urlVenueId = searchParams.get('venueId');
    const urlShiftId = searchParams.get('shiftId');
    if (urlChequeId) setSelectedId(urlChequeId);
    if (urlVenueId) setVenueId(urlVenueId);
    setShiftId(urlShiftId);
  }, [searchParams]);

  useEffect(() => {
    if (shiftId && venueId) loadShiftContext(shiftId, venueId);
    else setShiftContext(null);
  }, [shiftId, venueId, loadShiftContext]);

  useEffect(() => {
    if (selectedId && venueId) {
      loadDetail(selectedId, venueId).catch((e) => setError(friendlyError(e)));
      syncUrl(selectedId, venueId);
    }
  }, [selectedId, venueId, loadDetail, syncUrl]);

  const closeAction = useCallback(() => setActionTarget(null), []);

  const runAction = useCallback(
    async (body) => {
      const target = actionTarget;
      const path = managerActionPath(target);
      if (!path) return;

      setBusy(true);
      setError('');
      try {
        const q = venueId ? `?venueId=${venueId}` : '';
        await apiFetch(`${path}${q}`, {
          method: managerActionMethod(target),
          body: JSON.stringify(body),
        });
        setActionTarget(null);
        await load();
        const actedId = target.chequeId;
        if (actedId) await loadDetail(actedId, venueId);
      } catch (e) {
        setError(friendlyError(e));
      } finally {
        setBusy(false);
      }
    },
    [actionTarget, venueId, load, loadDetail],
  );

  const openDiscountRequest = useCallback((cheque, actionType = 'discount') => {
    setDiscountMode(cheque.isCrossVenue ? 'percent' : 'amount');
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
      isCrossVenue: cheque.isCrossVenue,
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

  const changeTab = useCallback(
    (tab) => {
      setStatusTab(tab);
      setSelectedId(null);
      setDetail(null);
      syncUrl(null, venueId);
    },
    [venueId, syncUrl],
  );

  const changeVenue = useCallback(
    (id) => {
      setVenueId(id);
      setSelectedId(null);
      setDetail(null);
      syncUrl(null, id);
    },
    [syncUrl],
  );

  const clearShiftFilter = useCallback(() => {
    setShiftId(null);
    setShiftContext(null);
    setSelectedId(null);
    setDetail(null);
    syncUrl(null, venueId, null);
  }, [venueId, syncUrl]);

  const selectCheque = useCallback(
    (cheque) => {
      setSelectedId(cheque.id);
      if (cheque.venueId) setVenueId(cheque.venueId);
      syncUrl(cheque.id, cheque.venueId ?? venueId);
    },
    [venueId, syncUrl],
  );

  const setSearch = useCallback((q) => {
    setSearchQ(q);
    setSelectedId(null);
    setDetail(null);
  }, []);

  return {
    venues,
    venueId,
    shiftId,
    shiftContext,
    clearShiftFilter,
    statusTab,
    hubSearchActive,
    searchQ,
    cheques,
    selectedId,
    setSelectedId: (id) => {
      const cheque = cheques.find((c) => c.id === id);
      if (cheque) selectCheque(cheque);
      else {
        setSelectedId(id);
        syncUrl(id, venueId);
      }
    },
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
    setSearch,
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
