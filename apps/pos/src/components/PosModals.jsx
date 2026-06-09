import { DiscountModal } from './DiscountModal.jsx';
import { ModifierModal } from './ModifierModal.jsx';
import { PaidChequePickerModal } from './PaidChequePickerModal.jsx';
import { PayModal } from './PayModal.jsx';
import { RefundModal } from './RefundModal.jsx';
import { ShiftCloseModal } from './ShiftCloseModal.jsx';
import { ShiftOpenModal } from './ShiftOpenModal.jsx';
import { SplitAmountModal } from './SplitAmountModal.jsx';
import { SplitBillModal } from './SplitBillModal.jsx';
import { ChequeActionsSheet } from './ChequeActionsSheet.jsx';
import { TableFloorModal } from './TableFloorModal.jsx';
import { TransferModal } from './TransferModal.jsx';

/**
 * All POS overlays in one place. App.jsx passes session + modal state only.
 */
export function PosModals({
  t,
  language,
  cheque,
  crossVenueGroup,
  order,
  refundCheque,
  openCheques,
  tableLabel,
  features,
  shift,
  shiftSession,
  tableSession,
  floorByLabel,
  modals,
  error,
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
    setShowTransferModal,
    showTransferModal,
    openRefundFlow,
    showTableModal,
    setShowTableModal,
    showDiscountModal,
    setShowDiscountModal,
    discountModalMode,
    openDiscountModal,
    showActionsSheet,
    setShowActionsSheet,
    runFromActions,
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
    refundSubmitting,
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

  const { navigateToTable, deleteTable } = tableSession;

  async function handleSelectTable(label) {
    return navigateToTable(label);
  }

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
        <TableFloorModal
          venueTables={features.tables}
          openCheques={openCheques}
          currentChequeId={cheque?.id}
          currentTable={tableLabel}
          floorByLabel={floorByLabel}
          t={t}
          onClose={() => setShowTableModal(false)}
          onSelectTable={handleSelectTable}
          onDeleteCheque={deleteTable}
        />
      )}

      {showActionsSheet && cheque && (
        <ChequeActionsSheet
          cheque={cheque}
          order={order}
          t={t}
          discountsEnabled={features.discounts}
          refundsEnabled={features.refunds}
          lineTransferEnabled={features.lineTransfer}
          onClose={() => setShowActionsSheet(false)}
          onSplit={() => runFromActions(() => setShowSplitModal(true))}
          onSplitAmount={() => runFromActions(() => setShowSplitAmountModal(true))}
          onTransfer={() => runFromActions(() => setShowTransferModal(true))}
          onDiscount={() => runFromActions(() => openDiscountModal('apply'))}
          onEditDiscount={() => runFromActions(() => openDiscountModal('edit'))}
          onRemoveDiscount={() => runFromActions(() => openDiscountModal('remove'))}
          onRefund={() => runFromActions(openRefundFlow)}
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
          crossVenueGroup={crossVenueGroup}
          mode={discountModalMode}
          t={t}
          error={error}
          onCancel={() => setShowDiscountModal(false)}
          onConfirm={onConfirmDiscount}
        />
      )}

      {showRefundPicker && (
        <PaidChequePickerModal
          cheques={paidCheques}
          loading={loadingPaid}
          t={t}
          error={error}
          onCancel={closeRefundPicker}
          onSelect={onPickRefundCheque}
        />
      )}

      {showRefundModal && refundCheque && (
        <RefundModal
          cheque={refundCheque}
          t={t}
          error={error}
          submitting={refundSubmitting}
          onCancel={closeRefundModal}
          onConfirm={onConfirmRefund}
        />
      )}

      {showPayModal && cheque && (
        <PayModal
          cheque={cheque}
          payTotal={crossVenueGroup?.combinedTotal}
          t={t}
          error={error}
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
