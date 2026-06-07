import { useCallback, useState } from 'react';
import { callAgent } from '../api/agent.js';

const EMPTY = { venues: [] };

/**
 * Cross-venue settlement on an anchor terminal. Online-only: every call proxies
 * to the central hub through the local agent. Flow: select open cheques from
 * linked venues -> lock them into a settlement group -> pay once.
 */
export function useCrossVenue(cashierId) {
  const [open, setOpen] = useState(false);
  const [billable, setBillable] = useState(EMPTY);
  const [selected, setSelected] = useState(() => new Set());
  const [group, setGroup] = useState(null);
  const [step, setStep] = useState('select');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const loadBillable = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await callAgent('/v1/cross-venue/billable');
      setBillable(data ?? EMPTY);
    } catch (err) {
      setBillable(EMPTY);
      setError(err.message || 'Cross-venue billing is unavailable (hub offline)');
    } finally {
      setLoading(false);
    }
  }, []);

  const openModal = useCallback(() => {
    setOpen(true);
    setStep('select');
    setSelected(new Set());
    setGroup(null);
    setError('');
    loadBillable();
  }, [loadBillable]);

  const closeModal = useCallback(() => {
    setOpen(false);
    setSelected(new Set());
    setGroup(null);
    setStep('select');
    setError('');
  }, []);

  const toggleCheque = useCallback((chequeId) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(chequeId)) next.delete(chequeId);
      else next.add(chequeId);
      return next;
    });
  }, []);

  const createGroup = useCallback(async () => {
    if (selected.size === 0) return;
    setBusy(true);
    setError('');
    try {
      const created = await callAgent('/v1/cross-venue/groups', {
        method: 'POST',
        body: JSON.stringify({ cashierId, chequeIds: [...selected] }),
      });
      setGroup(created);
      setStep('pay');
    } catch (err) {
      setError(err.message || 'Could not lock the selected cheques');
      // Refresh so the cashier sees any cheque that was grabbed elsewhere.
      loadBillable();
    } finally {
      setBusy(false);
    }
  }, [cashierId, selected, loadBillable]);

  const cancelGroup = useCallback(async () => {
    if (!group) {
      setStep('select');
      return;
    }
    setBusy(true);
    try {
      await callAgent(`/v1/cross-venue/groups/${group.groupId}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ cashierId }),
      });
    } catch {
      // best-effort release
    } finally {
      setGroup(null);
      setSelected(new Set());
      setStep('select');
      setBusy(false);
      loadBillable();
    }
  }, [cashierId, group, loadBillable]);

  const payGroup = useCallback(
    async ({ method = 'cash', cardLast4, tendered, managerPin } = {}) => {
      if (!group) return null;
      setBusy(true);
      setError('');
      try {
        const result = await callAgent(`/v1/cross-venue/groups/${group.groupId}/pay`, {
          method: 'POST',
          body: JSON.stringify({
            cashierId,
            method,
            cardLast4,
            tendered,
            managerPin,
          }),
        });
        setGroup(result.group);
        setStep('done');
        return result;
      } catch (err) {
        setError(err.message || 'Payment failed');
        return null;
      } finally {
        setBusy(false);
      }
    },
    [cashierId, group],
  );

  return {
    open,
    openModal,
    closeModal,
    billable,
    selected,
    toggleCheque,
    group,
    step,
    loading,
    busy,
    error,
    setError,
    loadBillable,
    createGroup,
    cancelGroup,
    payGroup,
  };
}
