import { DiscountModal } from './DiscountModal.jsx';
import { ModifierModal } from './ModifierModal.jsx';
import { PaidChequePickerModal } from './PaidChequePickerModal.jsx';
import { PayModal } from './PayModal.jsx';
import { RefundModal } from './RefundModal.jsx';
import { ShiftCloseModal } from './ShiftCloseModal.jsx';
import { ShiftOpenModal } from './ShiftOpenModal.jsx';
import { SplitAmountModal } from './SplitAmountModal.jsx';
import { SplitBillModal } from './SplitBillModal.jsx';
import { TableSwitchModal } from './TableSwitchModal.jsx';
import { TransferModal } from './TransferModal.jsx';

/**
 * All POS overlays in one place. App.jsx passes session + modal state only.
 */
export function PosModals({
  t,
  language,
  cheque,
  refundCheque,
  openCheques,
  tableLabel,
  features,
  shift,
  shiftSession,
  tableSession,
  modals,
  onAddItemWithModifiers,
}) {
  const {
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
    showRefundPicker,
    showRefundModal,
    showPayModal,
    setShowPayModal,
    onConfirmSplit,
    onConfirmSplitAmount,
    onConfirmTransfer,
    onConfirmDiscount,
    onPickRefundCheque,
    onConfirmRefund,
    onConfirmPay,
    closeRefundModal,
    closeRefundPicker,
  } = modals;

  const {
    needsOpen,
    showOpenModal,
    openChequeCount,
    opening,
    showCloseModal,
    setShowCloseModal,
    closing,
    openShift,
    error: shiftModalError,
    setError: setShiftError,
    closeShift,
    dismissOpenModal,
  } = shiftSession;

  const { navigateToTable, selectOpenCheque, deleteTable } = tableSession;

  return (
    <>
      {showSplitModal && cheque && (
        <SplitBillModal
          cheque={cheque}
          language={language}
          t={t}
          onCancel={() => setShowSplitModal(false)}
          onConfirm={onConfirmSplit}
        />
      )}

      {showSplitAmountModal && cheque && (
        <SplitAmountModal
          cheque={cheque}
          t={t}
          onCancel={() => setShowSplitAmountModal(false)}
          onConfirm={onConfirmSplitAmount}
        />
      )}

      {showTableModal && (
        <TableSwitchModal
          openCheques={openCheques}
          currentChequeId={cheque?.id}
          currentTable={tableLabel}
          t={t}
          onClose={() => setShowTableModal(false)}
          onOpenTable={navigateToTable}
          onSelectCheque={selectOpenCheque}
          onDeleteTable={deleteTable}
        />
      )}

      {showTransferModal && cheque && (
        <TransferModal
          cheque={cheque}
          openCheques={openCheques}
          language={language}
          t={t}
          onCancel={() => setShowTransferModal(false)}
          onConfirm={onConfirmTransfer}
        />
      )}

      {showDiscountModal && cheque && (
        <DiscountModal
          cheque={cheque}
          mode={discountModalMode}
          t={t}
          onCancel={() => setShowDiscountModal(false)}
          onConfirm={onConfirmDiscount}
        />
      )}

      {showRefundPicker && (
        <PaidChequePickerModal
          cheques={paidCheques}
          loading={loadingPaid}
          t={t}
          onCancel={closeRefundPicker}
          onSelect={onPickRefundCheque}
        />
      )}

      {showRefundModal && refundCheque && (
        <RefundModal
          cheque={refundCheque}
          t={t}
          onCancel={closeRefundModal}
          onConfirm={onConfirmRefund}
        />
      )}

      {showPayModal && cheque && (
        <PayModal
          cheque={cheque}
          t={t}
          manualCardEnabled={features.manualCardPayment}
          manualCardThreshold={features.manualCardApprovalThreshold}
          onCancel={() => setShowPayModal(false)}
          onConfirm={onConfirmPay}
        />
      )}

      {needsOpen && showOpenModal && (
        <ShiftOpenModal
          t={t}
          opening={opening}
          openChequeCount={openChequeCount}
          error={shiftModalError}
          onCancel={dismissOpenModal}
          onConfirm={(float) => {
            setShiftError('');
            openShift(float);
          }}
        />
      )}

      {showCloseModal && shift && (
        <ShiftCloseModal
          shift={shift}
          t={t}
          closing={closing}
          onCancel={() => setShowCloseModal(false)}
          onConfirm={closeShift}
        />
      )}

      {modifierItem && (
        <ModifierModal
          item={modifierItem}
          language={language}
          t={t}
          onCancel={() => setModifierItem(null)}
          onConfirm={(mods) => {
            setModifierItem(null);
            onAddItemWithModifiers(modifierItem, mods);
          }}
        />
      )}
    </>
  );
}
