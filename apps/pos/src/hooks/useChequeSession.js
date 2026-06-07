import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { callAgent } from '../api/agent.js';
import { DEFAULT_TABLE, DEMO_CASHIER_ID } from '../constants.js';
import { normalizeTableLabel, parentOpenCheques } from '../utils/cheque.js';

export function useChequeSession({ menu, loading, shiftReady }) {
  const { t } = useTranslation();
  const [cheque, setCheque] = useState(null);
  const order = cheque?.draftOrder ?? null;
  const tableLabel = cheque?.tableLabel ?? '';
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [paying, setPaying] = useState(false);
  const [openCheques, setOpenCheques] = useState([]);

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
      setOpenCheques(Array.isArray(list) ? list : []);
    } catch {
      setOpenCheques([]);
    }
  }, []);

  const resumeCheque = useCallback(
    async (label) => {
      setError('');
      const table = normalizeTableLabel(label ?? DEFAULT_TABLE);
      if (!table) return { ok: false };
      try {
        const loaded = await callAgent('/v1/cheques/open', {
          method: 'POST',
          body: JSON.stringify({ cashierId: DEMO_CASHIER_ID, tableLabel: table }),
        });
        setCheque(loaded);
        await refreshOpenCheques();
        return { ok: true };
      } catch {
        setError(t('pos.chequeOpenFailed'));
        return { ok: false };
      }
    },
    [t, refreshOpenCheques],
  );

  const openCheque = resumeCheque;

  const switchToCheque = useCallback(
    async (tab) => resumeCheque(tab.tableLabel),
    [resumeCheque],
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
        const parents = parentOpenCheques(Array.isArray(list) ? list : []);
        setOpenCheques(parents);

        if (cheque?.id === tab.id) {
          if (parents.length) {
            await switchToCheque(parents[0]);
          } else {
            setCheque(null);
            await openCheque(DEFAULT_TABLE);
          }
        }
        return { ok: true };
      } catch (err) {
        setError(err?.message || t('pos.deleteTableFailed'));
        return { ok: false };
      }
    },
    [cheque?.id, switchToCheque, openCheque, t],
  );

  useEffect(() => {
    if (!loading && menu && shiftReady && !cheque) openCheque(DEFAULT_TABLE);
  }, [loading, menu, shiftReady, cheque, openCheque]);

  useEffect(() => {
    if (!loading && menu) refreshOpenCheques();
  }, [loading, menu, refreshOpenCheques]);

  async function addItemToOrder(item, modifiers = []) {
    const updated = await callAgent(`/v1/orders/${order.id}/items`, {
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
  }

  async function changeQty(itemId, quantity) {
    const updated = await callAgent(`/v1/orders/${order.id}/items/${itemId}`, {
      method: 'PATCH',
      body: JSON.stringify({ quantity }),
    });
    applyDraftOrder(updated);
  }

  async function handleSend() {
    if (!cheque || !order || sending) return;
    setSending(true);
    setError('');
    try {
      const result = await callAgent(`/v1/cheques/${cheque.id}/fire`, { method: 'POST' });
      setCheque(result.cheque);
      await refreshOpenCheques();
      return result.sentOrder;
    } catch {
      setError(t('pos.sendFailed'));
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
      setCheque(updated);
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
      setCheque(updated);
      await refreshOpenCheques();
      return true;
    } catch {
      setError(t('pos.splitFailed'));
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
      setCheque(updated);
      await refreshOpenCheques();
      return true;
    } catch {
      setError(t('pos.splitAmountFailed'));
      return false;
    }
  }

  async function confirmTransfer(transferBody) {
    if (!cheque) return false;
    setError('');
    try {
      const result = await callAgent(`/v1/cheques/${cheque.id}/transfer`, {
        method: 'POST',
        body: JSON.stringify({ cashierId: DEMO_CASHIER_ID, ...transferBody }),
      });
      setCheque(result.source);
      await refreshOpenCheques();
      return true;
    } catch {
      setError(t('pos.transferFailed'));
      return false;
    }
  }

  const refreshCheque = useCallback(async () => {
    if (!cheque?.id) return;
    try {
      const updated = await callAgent(`/v1/cheques/${cheque.id}`);
      setCheque(updated);
      await refreshOpenCheques();
    } catch {
      /* ignore */
    }
  }, [cheque?.id, refreshOpenCheques]);

  async function confirmDiscount(discountBody) {
    if (!cheque) return false;
    setError('');
    try {
      const updated = await callAgent(`/v1/cheques/${cheque.id}/discount`, {
        method: 'POST',
        body: JSON.stringify({ cashierId: DEMO_CASHIER_ID, ...discountBody }),
      });
      setCheque(updated);
      await refreshOpenCheques();
      return true;
    } catch (err) {
      const msg = err?.message ?? '';
      if (msg.toLowerCase().includes('pin')) {
        setError(t('pos.discountInvalidPin'));
      } else if (msg.toLowerCase().includes('send or clear')) {
        setError(t('pos.discountClearDraftFirst'));
      } else {
        setError(msg || t('pos.discountFailed'));
      }
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
      await callAgent(`/v1/cheques/${chequeId}/refund`, {
        method: 'POST',
        body: JSON.stringify({ cashierId: DEMO_CASHIER_ID, ...refundBody }),
      });
      return true;
    } catch (err) {
      const msg = err?.message ?? '';
      if (msg.toLowerCase().includes('pin')) {
        setError(t('pos.refundInvalidPin'));
      } else {
        setError(msg || t('pos.refundFailed'));
      }
      return false;
    }
  }

  async function confirmPay(paymentBody) {
    if (!cheque || paying) return false;
    setPaying(true);
    setError('');
    try {
      await callAgent(`/v1/cheques/${cheque.id}/pay`, {
        method: 'POST',
        body: JSON.stringify({ cashierId: DEMO_CASHIER_ID, ...paymentBody }),
      });
      await openCheque(cheque.tableLabel || DEFAULT_TABLE);
      return true;
    } catch {
      setError(t('pos.payFailed'));
      return false;
    } finally {
      setPaying(false);
    }
  }

  return {
    cheque,
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
    confirmRefund,
    loadPaidCheques,
    refreshCheque,
    confirmPay,
    navigateToTable,
    selectOpenCheque,
    deleteTable,
    refreshOpenCheques,
  };
}
