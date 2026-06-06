import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { callAgent } from './api/agent.js';
import { KitchenProgress } from './components/KitchenProgress.jsx';
import { MenuGrid } from './components/MenuGrid.jsx';
import { ModifierModal } from './components/ModifierModal.jsx';
import { PayModal } from './components/PayModal.jsx';
import { PosHeader } from './components/PosHeader.jsx';
import { ReceiptPanel } from './components/ReceiptPanel.jsx';
import { SplitBillModal } from './components/SplitBillModal.jsx';
import { SplitAmountModal } from './components/SplitAmountModal.jsx';
import { TransferModal } from './components/TransferModal.jsx';
import { ShiftCloseModal } from './components/ShiftCloseModal.jsx';
import { ShiftOpenModal } from './components/ShiftOpenModal.jsx';
import { useChequeSession } from './hooks/useChequeSession.js';
import { useShiftSession } from './hooks/useShiftSession.js';
import { useFeatures } from './hooks/useFeatures.js';
import { useKitchenSocket } from './hooks/useKitchenSocket.js';
import { usePrinterHealth } from './hooks/usePrinterHealth.js';

export default function App() {
  const { t, i18n } = useTranslation();
  const [menu, setMenu] = useState(null);
  const [activeCategoryId, setActiveCategoryId] = useState('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [modifierItem, setModifierItem] = useState(null);
  const [showPayModal, setShowPayModal] = useState(false);
  const [showSplitModal, setShowSplitModal] = useState(false);
  const [showSplitAmountModal, setShowSplitAmountModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [clock, setClock] = useState(() => new Date());

  const { features } = useFeatures();
  const printerOk = usePrinterHealth();
  const { kitchenWatch, setKitchenWatch } = useKitchenSocket();

  const loadMenu = useCallback(async () => {
    setLoading(true);
    try {
      let data = await callAgent('/v1/menu');
      if (!data.categories?.length) {
        await callAgent('/v1/menu/sync', { method: 'POST' });
        data = await callAgent('/v1/menu');
      }
      setMenu(data);
    } catch {
      setMenu(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMenu();
  }, [loadMenu]);

  useEffect(() => {
    const tick = setInterval(() => setClock(new Date()), 30_000);
    return () => clearInterval(tick);
  }, []);

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
  } = shiftSession;

  const session = useChequeSession({ menu, loading, shiftReady });
  const {
    cheque,
    order,
    tableLabel,
    setTableLabel,
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
    confirmPay,
    handleTableBlur,
    switchToCheque,
  } = session;

  const allItems = useMemo(
    () => menu?.categories?.flatMap((c) => c.items ?? []) ?? [],
    [menu],
  );

  const activeCategory = useMemo(() => {
    if (activeCategoryId === 'all') return null;
    return menu?.categories?.find((c) => c.id === activeCategoryId);
  }, [menu, activeCategoryId]);

  const displayItems = useMemo(() => {
    const base = activeCategoryId === 'all' ? allItems : (activeCategory?.items ?? []);
    const q = search.trim().toLowerCase();
    if (!q) return base;
    return base.filter(
      (item) =>
        item.nameEn.toLowerCase().includes(q) || item.nameAr.toLowerCase().includes(q),
    );
  }, [activeCategoryId, allItems, activeCategory, search]);

  function handleTapItem(item) {
    if (!order) return;
    if (order.status !== 'draft') {
      setError(t('pos.orderLocked'));
      return;
    }
    if (item.modifierGroups?.length) {
      setModifierItem(item);
      return;
    }
    setError('');
    addItemToOrder(item).catch(() => setError(t('pos.itemAddFailed')));
  }

  async function onSend() {
    const sent = await handleSend();
    if (sent) setKitchenWatch(sent);
  }

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

  async function onConfirmPay(body) {
    const ok = await confirmPay(body);
    if (ok) {
      setShowPayModal(false);
      setKitchenWatch(null);
      await refreshShift();
    }
  }

  const timeLabel = clock.toLocaleTimeString(i18n.language === 'ar' ? 'ar-EG' : 'en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  });

  const menuError = !loading && !menu?.categories?.length ? t('pos.menuLoadFailed') : '';
  const bannerError = error || shiftError || menuError;

  return (
    <div className="flex h-screen flex-col bg-slate-100 text-slate-900">
      {showSplitModal && cheque && (
        <SplitBillModal
          cheque={cheque}
          language={i18n.language}
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

      {showTransferModal && cheque && (
        <TransferModal
          cheque={cheque}
          openCheques={openCheques}
          t={t}
          onCancel={() => setShowTransferModal(false)}
          onConfirm={onConfirmTransfer}
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

      {needsOpen && (
        <ShiftOpenModal
          t={t}
          opening={opening}
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
          language={i18n.language}
          t={t}
          onCancel={() => setModifierItem(null)}
          onConfirm={(mods) => {
            setModifierItem(null);
            addItemToOrder(modifierItem, mods).catch(() => setError(t('pos.itemAddFailed')));
          }}
        />
      )}

      <PosHeader
        t={t}
        search={search}
        onSearchChange={setSearch}
        tableLabel={tableLabel}
        onTableLabelChange={setTableLabel}
        onTableBlur={handleTableBlur}
        shift={shift}
        onCloseShift={() => setShowCloseModal(true)}
      />

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
          openCheques={openCheques}
          printerOk={printerOk}
          sending={sending}
          paying={paying}
          onSwitchCheque={switchToCheque}
          onClear={handleClear}
          onSend={onSend}
          onSplit={() => setShowSplitModal(true)}
          onSplitAmount={() => setShowSplitAmountModal(true)}
          onTransfer={() => setShowTransferModal(true)}
          lineTransferEnabled={features.lineTransfer}
          onPay={() => setShowPayModal(true)}
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
