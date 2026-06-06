import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { callAgent } from '../api/agent.js';
import { DEMO_CASHIER_ID } from '../constants.js';

export function useChequeSession({ menu, loading }) {
  const { t } = useTranslation();
  const [cheque, setCheque] = useState(null);
  const order = cheque?.draftOrder ?? null;
  const [tableLabel, setTableLabel] = useState('T4');
  const tableLabelRef = useRef(tableLabel);
  tableLabelRef.current = tableLabel;
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

  const openCheque = useCallback(
    async (label) => {
      setError('');
      const table = (label ?? tableLabelRef.current).trim();
      if (!table) return;
      try {
        const opened = await callAgent('/v1/cheques/open', {
          method: 'POST',
          body: JSON.stringify({ cashierId: DEMO_CASHIER_ID, tableLabel: table }),
        });
        setCheque(opened);
        setTableLabel(table);
        await refreshOpenCheques();
      } catch {
        setError(t('pos.chequeOpenFailed'));
      }
    },
    [t, refreshOpenCheques],
  );

  const switchToCheque = useCallback(
    async (tab) => {
      setTableLabel(tab.tableLabel);
      tableLabelRef.current = tab.tableLabel;
      if (tab.splitLabel || tab.parentChequeId) {
        const loaded = await callAgent(`/v1/cheques/${tab.id}`);
        setCheque(loaded);
      } else {
        await openCheque(tab.tableLabel);
      }
    },
    [openCheque],
  );

  const syncTableLabel = useCallback(
    async (label) => {
      if (!order || order.status !== 'draft') return order;
      const trimmed = (label ?? tableLabelRef.current).trim();
      if ((order.tableLabel ?? '') === trimmed) return order;
      const updated = await callAgent(`/v1/orders/${order.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ tableLabel: trimmed || null }),
      });
      applyDraftOrder(updated);
      return updated;
    },
    [order, applyDraftOrder],
  );

  useEffect(() => {
    if (!loading && menu && !cheque) openCheque();
  }, [loading, menu, cheque, openCheque]);

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
      await syncTableLabel(tableLabelRef.current);
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

  async function confirmPay(paymentBody) {
    if (!cheque || paying) return false;
    setPaying(true);
    setError('');
    try {
      await callAgent(`/v1/cheques/${cheque.id}/pay`, {
        method: 'POST',
        body: JSON.stringify({ cashierId: DEMO_CASHIER_ID, ...paymentBody }),
      });
      await openCheque(tableLabelRef.current);
      return true;
    } catch {
      setError(t('pos.payFailed'));
      return false;
    } finally {
      setPaying(false);
    }
  }

  function handleTableBlur() {
    openCheque(tableLabelRef.current).catch(() => {});
  }

  return {
    cheque,
    order,
    tableLabel,
    setTableLabel,
    tableLabelRef,
    error,
    setError,
    sending,
    paying,
    openCheques,
    applyDraftOrder,
    addItemToOrder,
    changeQty,
    handleSend,
    handleClear,
    confirmSplit,
    confirmPay,
    handleTableBlur,
    switchToCheque,
  };
}
