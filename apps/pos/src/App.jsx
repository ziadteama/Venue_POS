import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KitchenProgress } from './components/KitchenProgress.jsx';
import { MenuGrid } from './components/MenuGrid.jsx';
import { PosHeader } from './components/PosHeader.jsx';
import { PosModals } from './components/PosModals.jsx';
import { ReceiptPanel } from './components/ReceiptPanel.jsx';
import { useChequeSession } from './hooks/useChequeSession.js';
import { useFeatures } from './hooks/useFeatures.js';
import { useKitchenSocket } from './hooks/useKitchenSocket.js';
import { useManagerSocket } from './hooks/useManagerSocket.js';
import { usePosMenu } from './hooks/usePosMenu.js';
import { usePosModals } from './hooks/usePosModals.js';
import { usePrinterHealth } from './hooks/usePrinterHealth.js';
import { useOrderLookup } from './hooks/useOrderLookup.js';
import { useShiftSession } from './hooks/useShiftSession.js';
import { OrderLookupModal } from './components/OrderLookupModal.jsx';

export default function App() {
  const { t, i18n } = useTranslation();
  const [refundCheque, setRefundCheque] = useState(null);
  const [clock, setClock] = useState(() => new Date());

  const orderLookup = useOrderLookup();
  const { features } = useFeatures();
  const printerOk = usePrinterHealth();
  const { kitchenWatch, setKitchenWatch } = useKitchenSocket();
  const { menu, loading, activeCategoryId, setActiveCategoryId, search, setSearch, displayItems } =
    usePosMenu();

  const shiftSession = useShiftSession();
  const {
    shift,
    shiftReady,
    needsOpen,
    opening,
    closing,
    showCloseModal,
    setShowCloseModal,
    openShift,
    closeShift,
    refreshShift,
    error: shiftError,
    setError: setShiftError,
    showOpenModal,
    promptOpenModal,
  } = shiftSession;

  const session = useChequeSession({ menu, loading, shiftReady });
  const {
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
  } = session;

  const modals = usePosModals({
    refundCheque,
    setRefundCheque,
    confirmSplit,
    confirmSplitAmount,
    confirmTransfer,
    confirmDiscount,
    confirmRefund,
    confirmPay,
    loadPaidCheques,
    refreshShift,
    setKitchenWatch,
    setError,
    t,
  });

  useEffect(() => {
    const tick = setInterval(() => setClock(new Date()), 30_000);
    return () => clearInterval(tick);
  }, []);

  useManagerSocket(cheque?.id, refreshCheque);

  function handleTapItem(item) {
    if (!order) return;
    if (order.status !== 'draft') {
      setError(t('pos.orderLocked'));
      return;
    }
    if (item.modifierGroups?.length) {
      modals.setModifierItem(item);
      return;
    }
    setError('');
    addItemToOrder(item).catch(() => setError(t('pos.itemAddFailed')));
  }

  async function onSend() {
    const sent = await handleSend();
    if (sent) setKitchenWatch(sent);
  }

  const timeLabel = clock.toLocaleTimeString(i18n.language === 'ar' ? 'ar-EG' : 'en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  });

  const menuError = !loading && !menu?.categories?.length ? t('pos.menuLoadFailed') : '';
  const bannerError = error || shiftError || menuError;

  return (
    <div className="flex h-screen flex-col bg-slate-100 text-slate-900">
      {orderLookup.open ? (
        <OrderLookupModal t={t} language={i18n.language} lookup={orderLookup} />
      ) : null}

      <PosModals
        t={t}
        language={i18n.language}
        cheque={cheque}
        refundCheque={refundCheque}
        openCheques={openCheques}
        tableLabel={tableLabel}
        features={features}
        shift={shift}
        shiftSession={shiftSession}
        tableSession={{ navigateToTable, selectOpenCheque, deleteTable }}
        modals={modals}
        onAddItemWithModifiers={(item, mods) =>
          addItemToOrder(item, mods).catch(() => setError(t('pos.itemAddFailed')))
        }
      />

      <PosHeader
        t={t}
        search={search}
        onSearchChange={setSearch}
        tableLabel={tableLabel}
        openCheques={openCheques}
        onOpenTables={() => modals.setShowTableModal(true)}
        shift={shift}
        onCloseShift={() => setShowCloseModal(true)}
        onOrderLookup={orderLookup.openLookup}
      />

      {needsOpen && !showOpenModal && (
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-amber-200 bg-amber-50 px-5 py-2 text-sm text-amber-900">
          <span>{t('pos.shiftRequiredBanner')}</span>
          <button
            type="button"
            onClick={promptOpenModal}
            className="shrink-0 rounded-lg bg-primary-to px-3 py-1.5 text-xs font-semibold text-white"
          >
            {t('pos.shiftOpenConfirm')}
          </button>
        </div>
      )}

      {bannerError && (
        <div className="shrink-0 border-b border-amber-200 bg-amber-50 px-5 py-2 text-center text-sm font-medium text-amber-800">
          {bannerError}
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <ReceiptPanel
          t={t}
          language={i18n.language}
          loading={loading}
          cheque={cheque}
          order={order}
          printerOk={printerOk}
          sending={sending}
          paying={paying}
          onClear={handleClear}
          onSend={onSend}
          onSplit={() => modals.setShowSplitModal(true)}
          onSplitAmount={() => modals.setShowSplitAmountModal(true)}
          onTransfer={() => modals.setShowTransferModal(true)}
          lineTransferEnabled={features.lineTransfer}
          discountsEnabled={features.discounts}
          refundsEnabled={features.refunds}
          onDiscount={() => modals.setShowDiscountModal(true)}
          onRefund={modals.openRefundFlow}
          onPay={() => {
            if (!shiftReady) {
              setShiftError(t('pos.shiftRequiredBanner'));
              promptOpenModal();
              return;
            }
            modals.setShowPayModal(true);
          }}
          payDisabled={!shiftReady}
          onChangeQty={changeQty}
        />

        <MenuGrid
          t={t}
          language={i18n.language}
          loading={loading}
          menu={menu}
          activeCategoryId={activeCategoryId}
          onCategoryChange={setActiveCategoryId}
          displayItems={displayItems}
          order={order}
          onTapItem={handleTapItem}
        />
      </div>

      <KitchenProgress kitchenWatch={kitchenWatch} language={i18n.language} t={t} />

      <footer className="flex shrink-0 items-center justify-between border-t border-slate-200 bg-white px-5 py-2 text-xs text-secondary">
        <span className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-primary-to" />
          {t('pos.online')}
        </span>
        <span>{timeLabel}</span>
      </footer>
    </div>
  );
}
