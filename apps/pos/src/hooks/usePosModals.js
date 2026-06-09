import { useState } from 'react';
import { callAgent } from '../api/agent.js';
import { parseApiError } from '../utils/apiError.js';

/**
 * Modal visibility + confirm handlers for POS overlays.
 * Keeps App.jsx as wiring only — add new modals here, render in PosModals.jsx.
 */
export function usePosModals({
  refundCheque,
  setRefundCheque,
  cheque,
  confirmSplit,
  confirmSplitAmount,
  confirmTransfer,
  confirmMoveTable,
  confirmDiscount,
  confirmChangeDiscount,
  confirmRemoveDiscount,
  confirmRefund,
  confirmPay,
  printChequeReceipt,
  loadPaidCheques,
  refreshShift,
  setKitchenWatch,
  setError,
  onRefundSuccess,
  t,
}) {
  const [showSplitModal, setShowSplitModal] = useState(false);
  const [showSplitAmountModal, setShowSplitAmountModal] = useState(false);
  const [showSplitPrintModal, setShowSplitPrintModal] = useState(false);
  const [splitPrinting, setSplitPrinting] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showTableModal, setShowTableModal] = useState(false);
  const [showDiscountModal, setShowDiscountModal] = useState(false);
  const [discountModalMode, setDiscountModalMode] = useState('apply');
  const [showActionsSheet, setShowActionsSheet] = useState(false);
  const [showRefundPicker, setShowRefundPicker] = useState(false);
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [refundSubmitting, setRefundSubmitting] = useState(false);
  const [showPayModal, setShowPayModal] = useState(false);
  const [payTarget, setPayTarget] = useState(null);
  const [showMoveTableModal, setShowMoveTableModal] = useState(false);
  const [modifierItem, setModifierItem] = useState(null);
  const [paidCheques, setPaidCheques] = useState([]);
  const [loadingPaid, setLoadingPaid] = useState(false);
  const [lastPayment, setLastPayment] = useState(null);

  async function onConfirmSplit(body) {
    const ok = await confirmSplit(body);
    if (ok) {
      setShowSplitModal(false);
      setShowSplitPrintModal(true);
    }
  }

  async function onConfirmSplitAmount(body) {
    const ok = await confirmSplitAmount(body);
    if (ok) {
      setShowSplitAmountModal(false);
      setShowSplitPrintModal(true);
    }
  }

  async function onConfirmTransfer(body) {
    const ok = await confirmTransfer(body);
    if (ok) setShowTransferModal(false);
  }

  async function onConfirmMoveTable(body) {
    const ok = await confirmMoveTable(body);
    if (ok) setShowMoveTableModal(false);
  }

  function openDiscountModal(mode = 'apply') {
    setDiscountModalMode(mode);
    setShowDiscountModal(true);
    setShowActionsSheet(false);
  }

  function openActionsSheet() {
    setShowActionsSheet(true);
  }

  function runFromActions(action) {
    setShowActionsSheet(false);
    action();
  }

  async function onConfirmDiscount(body) {
    const handlers = {
      apply: confirmDiscount,
      edit: confirmChangeDiscount,
      remove: confirmRemoveDiscount,
    };
    const ok = await handlers[discountModalMode]?.(body);
    if (ok) setShowDiscountModal(false);
  }

  async function openRefundFlow() {
    setError('');
    setLoadingPaid(true);
    setShowRefundPicker(true);
    const list = await loadPaidCheques();
    setPaidCheques(list);
    setLoadingPaid(false);
  }

  async function onPickRefundCheque(tab) {
    try {
      const detail =
        tab?.payments?.length || tab?.refunds?.length
          ? tab
          : await callAgent(`/v1/cheques/${tab.id}`);
      setRefundCheque(detail);
      setShowRefundPicker(false);
      setShowRefundModal(true);
    } catch (err) {
      setError(parseApiError(err?.message, t('pos.refundLoadFailed')));
      setShowRefundPicker(false);
    }
  }

  async function onConfirmRefund(body) {
    if (!refundCheque) return;
    setRefundSubmitting(true);
    setError('');
    const result = await confirmRefund(refundCheque.id, body);
    setRefundSubmitting(false);
    if (result?.ok) {
      setShowRefundModal(false);
      setRefundCheque(null);
      setError('');
      onRefundSuccess?.(result);
      return result;
    }
    return result;
  }

  function openPayModal(target = null) {
    setPayTarget(target);
    setShowPayModal(true);
  }

  async function onConfirmPay(body) {
    const snapshot = payTarget ?? cheque;
    const result = await confirmPay(body, payTarget?.id);
    if (result?.ok) {
      setShowPayModal(false);
      setPayTarget(null);
      if (result.settled) {
        setKitchenWatch(null);
        await refreshShift();
        if (snapshot) {
          setLastPayment({
            tableLabel: snapshot.tableLabel,
            chequeNumber: snapshot.chequeNumber,
            total: snapshot.total,
          });
        }
      }
    }
  }

  async function handleSplitPrint(mode) {
    if (!cheque?.id) return;
    setSplitPrinting(true);
    try {
      await printChequeReceipt(mode);
    } finally {
      setSplitPrinting(false);
    }
  }

  return {
    modifierItem,
    setModifierItem,
    paidCheques,
    loadingPaid,
    lastPayment,
    clearLastPayment: () => setLastPayment(null),
    showSplitModal,
    setShowSplitModal,
    showSplitAmountModal,
    setShowSplitAmountModal,
    showSplitPrintModal,
    setShowSplitPrintModal,
    splitPrinting,
    showTransferModal,
    setShowTransferModal,
    showTableModal,
    setShowTableModal,
    showDiscountModal,
    setShowDiscountModal,
    discountModalMode,
    openDiscountModal,
    showActionsSheet,
    setShowActionsSheet,
    openActionsSheet,
    runFromActions,
    showRefundPicker,
    showRefundModal,
    setShowRefundModal,
    showPayModal,
    setShowPayModal,
    payTarget,
    openPayModal,
    showMoveTableModal,
    setShowMoveTableModal,
    onConfirmMoveTable,
    openRefundFlow,
    onConfirmSplit,
    onConfirmSplitAmount,
    onConfirmTransfer,
    onConfirmDiscount,
    onPickRefundCheque,
    onConfirmRefund,
    onConfirmPay,
    handleSplitPrint,
    printChequeReceipt,
    refundSubmitting,
    closeRefundModal: () => {
      setShowRefundModal(false);
      setRefundCheque(null);
      setError('');
    },
    closeRefundPicker: () => setShowRefundPicker(false),
    isAnyModalOpen:
      showSplitModal ||
      showSplitAmountModal ||
      showSplitPrintModal ||
      showTransferModal ||
      showTableModal ||
      showDiscountModal ||
      showActionsSheet ||
      showRefundPicker ||
      showRefundModal ||
      showPayModal ||
      showMoveTableModal ||
      Boolean(modifierItem),
  };
}
