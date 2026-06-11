import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useChequeSession } from './useChequeSession.js';
import { useCashierSession } from './useCashierSession.js';
import { useCrossSell } from './useCrossSell.js';
import { useFeatures } from './useFeatures.js';
import { useKitchenSocket } from './useKitchenSocket.js';
import { useManagerSocket } from './useManagerSocket.js';
import { useManagerNotifications } from './useManagerNotifications.js';
import { useOrderLookup } from './useOrderLookup.js';
import { usePosMenu } from './usePosMenu.js';
import { usePosModals } from './usePosModals.js';
import { usePrinterHealth } from './usePrinterHealth.js';
import { useShiftSession } from './useShiftSession.js';
import { useAppUpdater } from './useAppUpdater.js';
import { useAgentStatus } from './useAgentStatus.js';
import { useFloorTables } from './useFloorTables.js';
import { useFloorSocket } from './useFloorSocket.js';

/**
 * Composes POS session hooks, cross-sell menu wiring, and action handlers.
 * Render tree lives in PosWorkspace.jsx; modals in PosModals.jsx.
 */
export function usePosWorkspace(cashier) {
  const { t, i18n } = useTranslation();
  const [refundCheque, setRefundCheque] = useState(null);
  const [managerNotice, setManagerNotice] = useState(null);
  const [clock, setClock] = useState(() => new Date());
  const [showLogoutModal, setShowLogoutModal] = useState(false);

  const orderLookup = useOrderLookup();
  const printerOk = usePrinterHealth();
  const agentStatus = useAgentStatus();
  const { features } = useFeatures({ agentReachable: agentStatus.agentReachable });
  const homeVenueId = features.anchorVenue?.id ?? null;
  const floorEnabled =
    agentStatus.agentReachable && (agentStatus.online || agentStatus.coordinatorActive);
  const crossSell = useCrossSell(features, homeVenueId, {
    online: agentStatus.online,
    coordinatorActive: agentStatus.coordinatorActive,
  });
  const { floorByLabel, refreshFloor, coordinatorUnreachable } = useFloorTables({
    enabled: floorEnabled,
    coordinatorActive: agentStatus.coordinatorActive,
    online: agentStatus.online,
  });
  useFloorSocket({
    enabled: floorEnabled,
    agentReachable: agentStatus.agentReachable,
    onFloorUpdate: refreshFloor,
  });
  const { kitchenWatch, setKitchenWatch } = useKitchenSocket(features.kdsEnabled);
  const {
    menu,
    loading,
    menuError: menuCacheError,
    activeCategoryId,
    setActiveCategoryId,
    search,
    setSearch,
    displayItems,
  } = usePosMenu();

  const appUpdater = useAppUpdater();
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
    confirmMoveTable,
    confirmDiscount,
    confirmChangeDiscount,
    confirmRemoveDiscount,
    confirmRefund,
    loadPaidCheques,
    refreshCheque,
    confirmPay,
    resumeCheque,
    resumeTakeaway,
    printChequeReceipt,
    navigateToTable,
    selectOpenCheque,
    deleteTable,
    refreshOpenCheques,
  } = session;

  const deleteTableAndRefresh = useCallback(
    async (tab) => {
      const result = await deleteTable(tab);
      if (result?.ok !== false) await refreshFloor();
      return result;
    },
    [deleteTable, refreshFloor],
  );

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
    onPaySettled: async (paidTableLabel, { serviceMode } = {}) => {
      if (serviceMode === 'takeaway') {
        await resumeTakeaway();
      } else if (paidTableLabel) {
        await resumeCheque(paidTableLabel);
      }
    },
    printChequeReceipt,
    loadPaidCheques,
    refreshShift,
    setKitchenWatch,
    setError,
    onRefundSuccess: (result) => {
      setManagerNotice({
        id: `self-refund-${Date.now()}`,
        self: true,
        payload: result,
      });
    },
    t,
  });

  const { setShowTableModal, openActionsSheet } = modals;

  useEffect(() => {
    const tick = setInterval(() => setClock(new Date()), 30_000);
    return () => clearInterval(tick);
  }, []);

  useManagerSocket(cheque?.id, refreshCheque);

  useManagerNotifications((payload) => {
    if (payload.type !== 'refund') return;
    setManagerNotice({
      id: `${payload.chequeNumber}-${payload.at ?? Date.now()}`,
      payload,
    });
  });

  useEffect(() => {
    if (!managerNotice) return undefined;
    const timer = setTimeout(() => setManagerNotice(null), 12000);
    return () => clearTimeout(timer);
  }, [managerNotice]);

  const openTables = useCallback(async () => {
    setShowTableModal(true);
    await Promise.all([refreshOpenCheques(), refreshFloor()]);
  }, [setShowTableModal, refreshOpenCheques, refreshFloor]);

  const openTableCheque = useCallback(
    async (targetTable) => {
      const result = await navigateToTable(targetTable);
      if (result?.ok !== false) {
        setError('');
        setShowTableModal(false);
      }
      return result;
    },
    [navigateToTable, setError, setShowTableModal],
  );

  const openTakeawayCheque = useCallback(async () => {
    const result = await resumeTakeaway();
    if (result?.ok !== false) setError('');
    return result;
  }, [resumeTakeaway, setError]);

  function handleTapItem(item) {
    if (!cheque) {
      setError('');
      void openTables();
      return;
    }

    const isRemote =
      crossSell.crossSellMode && crossSell.isRemoteVenue && crossSell.activeVenueId;

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

  function handleAddItemWithModifiers(item, mods) {
    const venueId =
      crossSell.crossSellMode && crossSell.isRemoteVenue ? crossSell.activeVenueId : undefined;
    addItemToOrder(item, mods, { venueId }).catch(() => setError(t('pos.itemAddFailed')));
  }

  async function onSend() {
    const sent = await handleSend();
    if (sent && features.kdsEnabled) setKitchenWatch(sent);
  }

  function onPay(target = null) {
    if (!shiftReady) {
      setShiftError(t('pos.shiftRequiredBanner'));
      promptOpenModal();
      return;
    }
    modals.openPayModal(target);
  }

  async function onPrintCheck(chequeId) {
    await printChequeReceipt('single', { chequeId });
  }

  async function onPrintFullSplit() {
    await printChequeReceipt('full');
  }

  const timeLabel = clock.toLocaleTimeString(i18n.language === 'ar' ? 'ar-EG' : 'en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  });

  const menuError =
    menuCacheError === 'menuNotCached'
      ? t('pos.menuNotCached')
      : !loading && !menu?.categories?.length
        ? t('pos.menuLoadFailed')
        : '';
  const bannerError = error || shiftError || menuError;
  const logoutBlocked = Boolean(shift);

  const menuOrder =
    crossSell.crossSellMode && crossSell.isRemoteVenue ? { status: 'draft' } : order;

  return {
    t,
    i18n,
    refundCheque,
    showLogoutModal,
    setShowLogoutModal,
    orderLookup,
    printerOk,
    features,
    crossSell,
    homeVenueId,
    groupLocked,
    kitchenWatch: features.kdsEnabled ? kitchenWatch : null,
    menu,
    loading,
    search,
    setSearch,
    shiftSession,
    shift,
    shiftReady,
    needsOpen,
    setShowCloseModal,
    showOpenModal,
    promptOpenModal,
    cheque,
    crossVenueGroup,
    order,
    tableLabel,
    error,
    setError,
    sending,
    paying,
    openCheques,
    modals,
    handleTapItem,
    handleAddItemWithModifiers,
    onSend,
    onPay,
    onPrintCheck,
    onPrintFullSplit,
    handleClear,
    changeQty,
    navigateToTable: openTableCheque,
    selectOpenCheque,
    deleteTable: deleteTableAndRefresh,
    freeTable: async () => {
      if (cheque) await deleteTableAndRefresh(cheque);
    },
    refreshOpenCheques,
    refreshFloor,
    openTables,
    openTakeawayCheque,
    menuForGrid,
    menuDisplayItems,
    gridCategoryId,
    onGridCategoryChange,
    menuGridLoading,
    menuOrder,
    timeLabel,
    bannerError,
    logoutBlocked,
    setShowTableModal,
    openActionsSheet,
    agentStatus,
    floorByLabel,
    coordinatorUnreachable,
    managerNotice,
    setManagerNotice,
    appUpdater,
  };
}

/** Auth gate — keeps App.jsx minimal. */
export function usePosApp() {
  const { t } = useTranslation();
  const cashierSession = useCashierSession();
  return { t, cashierSession };
}
