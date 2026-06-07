import { useCallback, useEffect, useState } from 'react';
import { callAgent } from '../api/agent.js';

export function useOrderLookup() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [chequeNumber, setChequeNumber] = useState('');
  const [tableLabel, setTableLabel] = useState('');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState(null);
  const [selectedChequeId, setSelectedChequeId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [receipt, setReceipt] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const buildQuery = useCallback(() => {
    const params = new URLSearchParams({
      page: String(page),
      limit: '20',
      groupBy: 'cheque',
    });
    if (q.trim()) params.set('q', q.trim());
    if (chequeNumber.trim()) params.set('chequeNumber', chequeNumber.trim());
    if (tableLabel.trim()) params.set('tableLabel', tableLabel.trim());
    return params.toString();
  }, [page, q, chequeNumber, tableLabel]);

  const loadList = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setResult(await callAgent(`/v1/order-explorer?${buildQuery()}`));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [buildQuery]);

  useEffect(() => {
    if (!open) return;
    loadList();
  }, [open, loadList]);

  useEffect(() => {
    if (!open || !selectedChequeId) {
      setDetail(null);
      setReceipt('');
      return;
    }
    const path = selectedChequeId.startsWith('orphan:')
      ? `/v1/order-explorer/orders/${selectedChequeId.replace('orphan:', '')}`
      : `/v1/order-explorer/by-cheque/${selectedChequeId}`;
    callAgent(path)
      .then(setDetail)
      .catch((e) => setError(e.message));
  }, [open, selectedChequeId]);

  function openLookup() {
    setOpen(true);
    setPage(1);
    setSelectedChequeId(null);
    setReceipt('');
    setError('');
  }

  function closeLookup() {
    setOpen(false);
    setSelectedChequeId(null);
    setDetail(null);
    setReceipt('');
    setError('');
  }

  function resetSearch() {
    setQ('');
    setChequeNumber('');
    setTableLabel('');
    setPage(1);
    setSelectedChequeId(null);
  }

  async function reprintOrder(orderId) {
    const data = await callAgent(`/v1/order-explorer/orders/${orderId}/receipt`);
    setReceipt(data.text);
  }

  async function reprintCheque(chequeId) {
    const data = await callAgent(`/v1/cheques/${chequeId}/receipt`);
    setReceipt(data.text);
  }

  return {
    open,
    openLookup,
    closeLookup,
    setError,
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
  };
}
