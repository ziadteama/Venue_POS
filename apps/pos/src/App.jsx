import { useEffect, useMemo, useState } from 'react';

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

import { useCrossSell } from './hooks/useCrossSell.js';

import { useCashierSession } from './hooks/useCashierSession.js';

import { OrderLookupModal } from './components/OrderLookupModal.jsx';

import { CrossSellBar } from './components/CrossSellBar.jsx';

import { PinLoginScreen } from './components/PinLoginScreen.jsx';

import { LogoutConfirmModal } from './components/LogoutConfirmModal.jsx';



function PosWorkspace({ cashier, onLogout }) {

  const { t, i18n } = useTranslation();

  const [refundCheque, setRefundCheque] = useState(null);

  const [clock, setClock] = useState(() => new Date());

  const [showLogoutModal, setShowLogoutModal] = useState(false);



  const orderLookup = useOrderLookup();

  const printerOk = usePrinterHealth();

  const { features, loading: featuresLoading } = useFeatures();

  const homeVenueId = features.anchorVenue?.id ?? null;

  const crossSell = useCrossSell(features, homeVenueId);

  const { kitchenWatch, setKitchenWatch } = useKitchenSocket(features.kdsEnabled);

  const { menu, loading, activeCategoryId, setActiveCategoryId, search, setSearch, displayItems } =

    usePosMenu();



  const shiftSession = useShiftSession(cashier.id);

  const {

    shift,

    shiftReady,

    needsOpen,

    setShowCloseModal,

    refreshShift,

    error: shiftError,

    setError: setShiftError,

    showOpenModal,

    promptOpenModal,

  } = shiftSession;



  const session = useChequeSession({ menu, loading, cashierId: cashier.id, homeVenueId });

  const {

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

    confirmPay,

    navigateToTable,

    selectOpenCheque,

    deleteTable,

  } = session;

  const groupLocked = Boolean(crossVenueGroup?.groupId);

  const { lockCrossSell } = crossSell;

  useEffect(() => {
    if (groupLocked) lockCrossSell();
  }, [groupLocked, lockCrossSell]);

  const menuForGrid = crossSell.crossSellMode ? crossSell.getActiveMenu(menu) : menu;

  const baseDisplayItems = crossSell.crossSellMode
    ? crossSell.getDisplayItems(menu)
    : displayItems;

  const menuDisplayItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return baseDisplayItems;
    return baseDisplayItems.filter(
      (item) =>
        item.nameEn.toLowerCase().includes(q) || item.nameAr.toLowerCase().includes(q),
    );
  }, [baseDisplayItems, search]);

  const gridCategoryId = crossSell.crossSellMode ? crossSell.activeCategoryId : activeCategoryId;

  const onGridCategoryChange = crossSell.crossSellMode
    ? crossSell.setActiveCategoryId
    : setActiveCategoryId;

  const menuGridLoading =
    loading || (crossSell.crossSellMode && crossSell.isRemoteVenue && crossSell.menuLoading);

  const modals = usePosModals({

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

  });



  useEffect(() => {

    const tick = setInterval(() => setClock(new Date()), 30_000);

    return () => clearInterval(tick);

  }, []);



  useManagerSocket(cheque?.id, refreshCheque);



  const { setShowTableModal, openActionsSheet } = modals;



  useEffect(() => {

    if (!loading && !featuresLoading && shiftReady && !cheque && !shiftSession.showOpenModal) {

      setShowTableModal(true);

    }

  }, [loading, featuresLoading, shiftReady, cheque, shiftSession.showOpenModal, setShowTableModal]);



  function handleTapItem(item) {
    if (!cheque || !order) {
      modals.setShowTableModal(true);
      return;
    }

    const isRemote =
      crossSell.crossSellMode &&
      crossSell.isRemoteVenue &&
      crossSell.activeVenueId;

    if (!isRemote && order.status !== 'draft') {
      setError(t('pos.orderLocked'));
      return;
    }

    if (item.modifierGroups?.length) {
      modals.setModifierItem(item);
      return;
    }

    setError('');
    const venueId = isRemote ? crossSell.activeVenueId : undefined;
    addItemToOrder(item, [], { venueId }).catch(() => setError(t('pos.itemAddFailed')));
  }



  async function onSend() {

    const sent = await handleSend();

    if (sent && features.kdsEnabled) setKitchenWatch(sent);

  }



  const timeLabel = clock.toLocaleTimeString(i18n.language === 'ar' ? 'ar-EG' : 'en-GB', {

    hour: '2-digit',

    minute: '2-digit',

  });



  const menuError = !loading && !menu?.categories?.length ? t('pos.menuLoadFailed') : '';

  const bannerError = error || shiftError || menuError;

  const logoutBlocked = Boolean(shift);



  return (

    <div className="flex h-screen flex-col bg-slate-100 text-slate-900">

      {showLogoutModal ? (

        <LogoutConfirmModal

          t={t}

          reason={logoutBlocked ? t('pos.logoutBlockedShift') : ''}

          onCancel={() => setShowLogoutModal(false)}

          onConfirm={() => {

            setShowLogoutModal(false);

            onLogout();

          }}

          onCloseShift={() => {

            setShowLogoutModal(false);

            setShowCloseModal(true);

          }}

        />

      ) : null}



      {orderLookup.open ? (

        <OrderLookupModal t={t} language={i18n.language} lookup={orderLookup} />

      ) : null}



      <PosModals

        t={t}

        language={i18n.language}

        cheque={cheque}

        crossVenueGroup={crossVenueGroup}

        order={order}

        refundCheque={refundCheque}

        openCheques={openCheques}

        tableLabel={tableLabel}

        features={features}

        shift={shift}

        shiftSession={shiftSession}

        tableSession={{ navigateToTable, selectOpenCheque, deleteTable }}

        modals={modals}

        onAddItemWithModifiers={(item, mods) => {
          const venueId =
            crossSell.crossSellMode && crossSell.isRemoteVenue
              ? crossSell.activeVenueId
              : undefined;
          addItemToOrder(item, mods, { venueId }).catch(() => setError(t('pos.itemAddFailed')));
        }}

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

        cashierUsername={cashier.username}

        onLogout={() => setShowLogoutModal(true)}

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

          crossVenueGroup={crossVenueGroup}

          order={order}

          tableLabel={tableLabel}

          printerOk={printerOk}

          sending={sending}

          paying={paying}

          onClear={handleClear}

          onSend={onSend}

          onOpenActions={openActionsSheet}

          onPickTable={() => setShowTableModal(true)}

          onEditDiscount={() => modals.openDiscountModal('edit')}

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



        <div className={`relative min-w-0 flex-1 ${!cheque ? 'pointer-events-none opacity-50' : ''}`}>

          {!cheque ? (

            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-slate-100/40 px-6 text-center">

              <p className="max-w-sm rounded-xl bg-white/95 px-4 py-3 text-sm font-medium text-slate-700 shadow-sm ring-1 ring-slate-200">

                {t('pos.selectTableForMenu')}

              </p>

            </div>

          ) : null}

          <CrossSellBar
            t={t}
            language={i18n.language}
            crossSell={crossSell}
            homeVenueId={homeVenueId}
            groupLocked={groupLocked}
          />

          <MenuGrid

            t={t}

            language={i18n.language}

            loading={menuGridLoading}

            menu={menuForGrid}

            activeCategoryId={gridCategoryId}

            onCategoryChange={onGridCategoryChange}

            displayItems={menuDisplayItems}

            order={
              crossSell.crossSellMode && crossSell.isRemoteVenue
                ? { status: 'draft' }
                : order
            }

            onTapItem={handleTapItem}

          />

        </div>

      </div>



      {features.kdsEnabled ? (

        <KitchenProgress kitchenWatch={kitchenWatch} language={i18n.language} t={t} />

      ) : null}



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



export default function App() {

  const { t } = useTranslation();

  const cashierSession = useCashierSession();



  if (!cashierSession.isLoggedIn) {

    return (

      <PinLoginScreen

        t={t}

        onLogin={cashierSession.login}

        loading={cashierSession.loading}

        error={cashierSession.error}

      />

    );

  }



  return <PosWorkspace cashier={cashierSession.cashier} onLogout={cashierSession.logout} />;

}

