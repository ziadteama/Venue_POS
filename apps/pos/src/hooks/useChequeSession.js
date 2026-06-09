import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { callAgent } from '../api/agent.js';
import { parseApiError } from '../utils/apiError.js';
import { normalizeTableLabel, parentOpenCheques } from '../utils/cheque.js';

export function useChequeSession({ menu, loading, cashierId, homeVenueId }) {
  const { t } = useTranslation();
  const [cheque, setCheque] = useState(null);
  const [crossVenueGroup, setCrossVenueGroup] = useState(null);
  const order = cheque?.draftOrder ?? null;
  const tableLabel = cheque?.tableLabel ?? '';
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [paying, setPaying] = useState(false);
  const [openCheques, setOpenCheques] = useState([]);

  const fail = useCallback(
    (err, fallbackKey) => parseApiError(err?.message ?? err, t(fallbackKey)),
    [t],
  );

  const applyChequePayload = useCallback((payload) => {
    if (!payload) return;
    if (payload.cheque) {
      setCheque(payload.cheque);
      setCrossVenueGroup(payload.group ?? null);
      return;
    }
    const { crossVenueGroup: group, ...chequeData } = payload;
    if (!chequeData.id) return;
    setCheque(chequeData);
    setCrossVenueGroup(group ?? null);
  }, []);

  const applyDraftOrder = useCallback((updated) => {
    setCheque((prev) => {
      if (!prev) return prev;
      const orders = (prev.orders ?? []).map((o) => (o.id === updated.id ? updated : o));
      if (!orders.some((o) => o.id === updated.id)) orders.push(updated);
      return { ...prev, draftOrder: updated, orders };
    });
  }, []);

  const refreshOpenCheques = useCallback(async () => {
    try {
      const list = await callAgent('/v1/cheques/open');
      setOpenCheques(parentOpenCheques(Array.isArray(list) ? list : []));
    } catch {
      setOpenCheques([]);
    }
  }, []);

  const resumeCheque = useCallback(
    async (label) => {
      setError('');
      const table = normalizeTableLabel(label);
      if (!table) return { ok: false };
      try {
        const loaded = await callAgent('/v1/cheques/open', {
          method: 'POST',
          body: JSON.stringify({ cashierId, tableLabel: table }),
        });
        applyChequePayload(loaded);
        await refreshOpenCheques();
        try {
          const current = await callAgent(`/v1/cheques/${loaded.id}`);
          if (current?.status === 'open') applyChequePayload(current);
        } catch {
          /* keep loaded payload if refresh fails */
        }
        return { ok: true, crossVenueGroup: loaded.crossVenueGroup ?? null };
      } catch (err) {
        setError(fail(err, 'pos.chequeOpenFailed'));
        return { ok: false };
      }
    },
    [cashierId, t, refreshOpenCheques, applyChequePayload],
  );

  const navigateToTable = useCallback(
    async (targetTable) => {
      const target = normalizeTableLabel(targetTable);
      if (!target) return { ok: false };
      if (cheque?.tableLabel === target) return { ok: true };
      return resumeCheque(target);
    },
    [cheque?.tableLabel, resumeCheque],
  );

  const selectOpenCheque = useCallback(
    async (tab) => {
      if (tab.id === cheque?.id) return { ok: true };
      return resumeCheque(tab.tableLabel);
    },
    [cheque?.id, resumeCheque],
  );

  const deleteTable = useCallback(
    async (tab) => {
      setError('');
      try {
        await callAgent(`/v1/cheques/${tab.id}`, { method: 'DELETE' });
        const list = await callAgent('/v1/cheques/open');
        setOpenCheques(parentOpenCheques(Array.isArray(list) ? list : []));

        if (cheque?.id === tab.id) {
          setCheque(null);
          setCrossVenueGroup(null);
        }
        return { ok: true };
      } catch (err) {
        setError(fail(err, 'pos.deleteTableFailed'));
        return { ok: false };
      }
    },
    [cheque?.id, t],
  );

  useEffect(() => {
    setCheque(null);
    setCrossVenueGroup(null);
    setError('');
  }, [cashierId]);

  useEffect(() => {
    if (!loading && menu && cashierId) refreshOpenCheques();
  }, [loading, menu, cashierId, refreshOpenCheques]);

  async function addItemToOrder(item, modifiers = [], { venueId } = {}) {
    const isRemote =
      venueId && homeVenueId && venueId !== homeVenueId && cheque?.id;

    if (isRemote) {
      const result = await callAgent(`/v1/cross-venue/cheques/${cheque.id}/items`, {
        method: 'POST',
        body: JSON.stringify({
          cashierId,
          venueId,
          menuItemId: item.id,
          quantity: 1,
          modifiers,
        }),
      });
      applyChequePayload(result);
      return;
    }

    let orderId = order?.id;
    if (!orderId && cheque?.id) {
      const refreshed = await callAgent(`/v1/cheques/${cheque.id}`);
      applyChequePayload(refreshed);
      orderId = refreshed?.draftOrder?.id;
    }
    if (!orderId && cheque?.tableLabel) {
      const reopened = await callAgent('/v1/cheques/open', {
        method: 'POST',
        body: JSON.stringify({ cashierId, tableLabel: cheque.tableLabel }),
      });
      applyChequePayload(reopened);
      orderId = reopened?.draftOrder?.id;
    }
    if (!orderId) throw new Error('No draft order on this table');

    const updated = await callAgent(`/v1/orders/${orderId}/items`, {
      method: 'POST',
      body: JSON.stringify({
        menuItemId: item.id,
        quantity: 1,
        nameEn: item.nameEn,
        nameAr: item.nameAr,
        unitPrice: item.price,
        modifiers,
      }),
    });
    applyDraftOrder(updated);
    if (cheque?.crossVenueGroupId) {
      await refreshCheque();
    }
  }

  async function changeQty(itemId, quantity, { venueId } = {}) {
    const useGroup =
      crossVenueGroup &&
      venueId &&
      homeVenueId &&
      venueId !== homeVenueId &&
      cheque?.id;

    if (useGroup) {
      let result;
      if (quantity <= 0) {
        result = await callAgent(
          `/v1/cross-venue/cheques/${cheque.id}/items/${itemId}?venueId=${venueId}`,
          { method: 'DELETE' },
        );
      } else {
        result = await callAgent(
          `/v1/cross-venue/cheques/${cheque.id}/items/${itemId}?venueId=${venueId}`,
          {
            method: 'PATCH',
            body: JSON.stringify({ quantity }),
          },
        );
      }
      applyChequePayload(result);
      return;
    }

    const updated = await callAgent(`/v1/orders/${order.id}/items/${itemId}`, {
      method: 'PATCH',
      body: JSON.stringify({ quantity }),
    });
    applyDraftOrder(updated);
    if (crossVenueGroup) await refreshCheque();
  }

  async function handleSend() {
    if (!cheque || sending) return;
    const hasGroupDraft =
      crossVenueGroup?.pendingTotal > 0 ||
      (crossVenueGroup?.venues ?? []).some((v) => v.draftOrder?.items?.length);
    const hasHomeDraft = (order?.items?.length ?? 0) > 0;
    if (!hasGroupDraft && !hasHomeDraft) return;

    setSending(true);
    setError('');
    try {
      const result = await callAgent(`/v1/cheques/${cheque.id}/fire`, { method: 'POST' });
      if (result.crossVenueGroup) {
        setCheque(result.cheque);
        setCrossVenueGroup(result.crossVenueGroup);
      } else if (result.cheque) {
        applyChequePayload(result.cheque);
      }
      await refreshOpenCheques();
      return result.sentOrder ?? result.sentOrders?.[0] ?? null;
    } catch (err) {
      setError(fail(err, 'pos.sendFailed'));
      return null;
    } finally {
      setSending(false);
    }
  }

  async function handleClear() {
    if (!cheque) return;
    setError('');
    try {
      const updated = await callAgent(`/v1/cheques/${cheque.id}/clear`, { method: 'POST' });
      applyChequePayload(updated);
      await refreshOpenCheques();
    } catch {
      setError(t('pos.clearFailed'));
    }
  }

  async function confirmSplit(splitBody) {
    if (!cheque) return;
    setError('');
    try {
      const updated = await callAgent(`/v1/cheques/${cheque.id}/split`, {
        method: 'POST',
        body: JSON.stringify(splitBody),
      });
      applyChequePayload(updated);
      await refreshOpenCheques();
      const fresh = await callAgent(`/v1/cheques/${cheque.id}`);
      applyChequePayload(fresh);
      return true;
    } catch (err) {
      setError(fail(err, 'pos.splitFailed'));
      return false;
    }
  }

  async function confirmSplitAmount(splitBody) {
    if (!cheque) return false;
    setError('');
    try {
      const updated = await callAgent(`/v1/cheques/${cheque.id}/split-amount`, {
        method: 'POST',
        body: JSON.stringify(splitBody),
      });
      applyChequePayload(updated);
      await refreshOpenCheques();
      const fresh = await callAgent(`/v1/cheques/${cheque.id}`);
      applyChequePayload(fresh);
      return true;
    } catch (err) {
      setError(fail(err, 'pos.splitAmountFailed'));
      return false;
    }
  }

  async function confirmTransfer(transferBody) {
    if (!cheque) return false;
    setError('');
    try {
      const result = await callAgent(`/v1/cheques/${cheque.id}/transfer`, {
        method: 'POST',
        body: JSON.stringify({ cashierId, ...transferBody }),
      });
      applyChequePayload(result.source);
      await refreshOpenCheques();
      return true;
    } catch (err) {
      setError(fail(err, 'pos.transferFailed'));
      return false;
    }
  }

  const refreshCheque = useCallback(async () => {
    if (!cheque?.id) return;
    try {
      const updated = await callAgent(`/v1/cheques/${cheque.id}`);
      applyChequePayload(updated);
      await refreshOpenCheques();
    } catch {
      /* ignore */
    }
  }, [cheque?.id, refreshOpenCheques, applyChequePayload]);

  function mapDiscountError(err, fallbackKey) {
    const msg = parseApiError(err?.message ?? err, '');
    if (msg.toLowerCase().includes('pin')) {
      setError(t('pos.discountInvalidPin'));
    } else if (msg.toLowerCase().includes('send or clear')) {
      setError(t('pos.discountClearDraftFirst'));
    } else if (msg.toLowerCase().includes('no discount')) {
      setError(t('pos.discountNoneApplied'));
    } else if (msg.toLowerCase().includes('edit or remove')) {
      setError(t('pos.discountAlreadyApplied'));
    } else {
      setError(msg || t(fallbackKey));
    }
  }

  async function confirmDiscount(discountBody) {
    if (!cheque) return false;
    setError('');
    try {
      const updated = await callAgent(`/v1/cheques/${cheque.id}/discount`, {
        method: 'POST',
        body: JSON.stringify({ cashierId, ...discountBody }),
      });
      applyChequePayload(updated);
      await refreshOpenCheques();
      return true;
    } catch (err) {
      mapDiscountError(err, 'pos.discountFailed');
      return false;
    }
  }

  async function confirmChangeDiscount(discountBody) {
    if (!cheque) return false;
    setError('');
    try {
      const updated = await callAgent(`/v1/cheques/${cheque.id}/discount`, {
        method: 'PATCH',
        body: JSON.stringify({ cashierId, ...discountBody }),
      });
      applyChequePayload(updated);
      await refreshOpenCheques();
      return true;
    } catch (err) {
      mapDiscountError(err, 'pos.discountChangeFailed');
      return false;
    }
  }

  async function confirmRemoveDiscount(discountBody) {
    if (!cheque) return false;
    setError('');
    try {
      const updated = await callAgent(`/v1/cheques/${cheque.id}/discount/remove`, {
        method: 'POST',
        body: JSON.stringify({ cashierId, ...discountBody }),
      });
      applyChequePayload(updated);
      await refreshOpenCheques();
      return true;
    } catch (err) {
      mapDiscountError(err, 'pos.discountRemoveFailed');
      return false;
    }
  }

  async function loadPaidCheques() {
    try {
      const list = await callAgent('/v1/cheques/paid');
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  }

  async function confirmRefund(chequeId, refundBody) {
    setError('');
    try {
      const result = await callAgent(`/v1/cheques/${chequeId}/refund`, {
        method: 'POST',
        body: JSON.stringify({ cashierId, ...refundBody }),
      });
      return {
        ok: true,
        amount: result?.refund?.amount,
        method: result?.refund?.method,
        chequeNumber: result?.cheque?.chequeNumber,
      };
    } catch (err) {
      const msg = parseApiError(err?.message ?? '');
      if (msg.toLowerCase().includes('pin')) {
        setError(t('pos.refundInvalidPin'));
      } else if (msg.toLowerCase().includes('exceeds') || msg.toLowerCase().includes('no ')) {
        setError(msg);
      } else {
        setError(msg || t('pos.refundFailed'));
      }
      return { ok: false };
    }
  }

  async function confirmPay(paymentBody, targetChequeId) {
    const payId = targetChequeId ?? cheque?.id;
    if (!payId || paying) return { ok: false };
    setPaying(true);
    setError('');
    try {
      const result = await callAgent(`/v1/cheques/${payId}/pay`, {
        method: 'POST',
        body: JSON.stringify({ cashierId, ...paymentBody }),
      });
      const parentId = cheque?.parentChequeId ?? cheque?.id ?? payId;
      const updated = await callAgent(`/v1/cheques/${parentId}`);
      applyChequePayload(updated);
      await refreshOpenCheques();
      return { ok: true, settled: Boolean(result.tableSettled) };
    } catch (err) {
      setError(fail(err, 'pos.payFailed'));
      return { ok: false };
    } finally {
      setPaying(false);
    }
  }

  async function confirmMoveTable({ targetTableLabel }) {
    if (!cheque?.id) return false;
    setError('');
    try {
      const updated = await callAgent(`/v1/cheques/${cheque.id}/table`, {
        method: 'PATCH',
        body: JSON.stringify({ targetTableLabel }),
      });
      applyChequePayload(updated);
      await refreshOpenCheques();
      return true;
    } catch (err) {
      setError(fail(err, 'pos.moveTableFailed'));
      return false;
    }
  }

  async function printChequeReceipt(mode = 'single', { chequeId } = {}) {
    if (!cheque?.id) return { ok: false };
    setError('');
    try {
      await callAgent(`/v1/cheques/${cheque.id}/print-receipt`, {
        method: 'POST',
        body: JSON.stringify({ mode, chequeId }),
      });
      return { ok: true };
    } catch (err) {
      setError(fail(err, 'pos.printFailed'));
      return { ok: false };
    }
  }

  return {
    cheque,
    crossVenueGroup,
    order,
    tableLabel,
    error,
    setError,
    sending,
    paying,
    openCheques,
    addItemToOrder,
    changeQty,
    handleSend,
    handleClear,
    confirmSplit,
    confirmSplitAmount,
    confirmTransfer,
    confirmDiscount,
    confirmChangeDiscount,
    confirmRemoveDiscount,
    confirmRefund,
    loadPaidCheques,
    refreshCheque,
    resumeCheque,
    confirmPay,
    confirmMoveTable,
    printChequeReceipt,
    navigateToTable,
    selectOpenCheque,
    deleteTable,
    refreshOpenCheques,
  };
}
