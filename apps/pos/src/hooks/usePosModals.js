import { useState } from 'react';
import { callAgent } from '../api/agent.js';

/**
 * Modal visibility + confirm handlers for POS overlays.
 * Keeps App.jsx as wiring only — add new modals here, render in PosModals.jsx.
 */
export function usePosModals({
  refundCheque,
  setRefundCheque,
  confirmSplit,
  confirmSplitAmount,
  confirmTransfer,
  confirmDiscount,
  confirmChangeDiscount,
  confirmRemoveDiscount,
  confirmRefund,
  confirmPay,
  loadPaidCheques,
  refreshShift,
  setKitchenWatch,
  setError,
  t,
}) {
  const [showSplitModal, setShowSplitModal] = useState(false);
  const [showSplitAmountModal, setShowSplitAmountModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showTableModal, setShowTableModal] = useState(false);
  const [showDiscountModal, setShowDiscountModal] = useState(false);
  const [discountModalMode, setDiscountModalMode] = useState('apply');
  const [showActionsSheet, setShowActionsSheet] = useState(false);
  const [showRefundPicker, setShowRefundPicker] = useState(false);
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [showPayModal, setShowPayModal] = useState(false);
  const [modifierItem, setModifierItem] = useState(null);
  const [paidCheques, setPaidCheques] = useState([]);
  const [loadingPaid, setLoadingPaid] = useState(false);

  async function onConfirmSplit(body) {
    const ok = await confirmSplit(body);
    if (ok) setShowSplitModal(false);
  }

  async function onConfirmSplitAmount(body) {
    const ok = await confirmSplitAmount(body);
    if (ok) setShowSplitAmountModal(false);
  }

  async function onConfirmTransfer(body) {
    const ok = await confirmTransfer(body);
    if (ok) setShowTransferModal(false);
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
    setLoadingPaid(true);
    setShowRefundPicker(true);
    const list = await loadPaidCheques();
    setPaidCheques(list);
    setLoadingPaid(false);
  }

  async function onPickRefundCheque(tab) {
    try {
      const detail = await callAgent(`/v1/cheques/${tab.id}`);
      setRefundCheque(detail);
      setShowRefundPicker(false);
      setShowRefundModal(true);
    } catch {
      setError(t('pos.refundLoadFailed'));
      setShowRefundPicker(false);
    }
  }

  async function onConfirmRefund(body) {
    if (!refundCheque) return;
    const ok = await confirmRefund(refundCheque.id, body);
    if (ok) {
      setShowRefundModal(false);
      setRefundCheque(null);
      setError('');
    }
  }

  async function onConfirmPay(body) {
    const ok = await confirmPay(body);
    if (ok) {
      setShowPayModal(false);
      setKitchenWatch(null);
      setShowTableModal(true);
      await refreshShift();
    }
  }

  return {
    modifierItem,
    setModifierItem,
    paidCheques,
    loadingPaid,
    showSplitModal,
    setShowSplitModal,
    showSplitAmountModal,
    setShowSplitAmountModal,
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
    openRefundFlow,
    onConfirmSplit,
    onConfirmSplitAmount,
    onConfirmTransfer,
    onConfirmDiscount,
    onPickRefundCheque,
    onConfirmRefund,
    onConfirmPay,
    closeRefundModal: () => {
      setShowRefundModal(false);
      setRefundCheque(null);
    },
    closeRefundPicker: () => setShowRefundPicker(false),
  };
}
