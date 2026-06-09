import { KitchenProgress } from './KitchenProgress.jsx';
import { MenuGrid } from './MenuGrid.jsx';
import { PosHeader } from './PosHeader.jsx';
import { PosModals } from './PosModals.jsx';
import { ReceiptPanel } from './ReceiptPanel.jsx';
import { OrderLookupModal } from './OrderLookupModal.jsx';
import { CrossSellBar } from './CrossSellBar.jsx';
import { LogoutConfirmModal } from './LogoutConfirmModal.jsx';
import { usePosWorkspace } from '../hooks/usePosWorkspace.js';

export function PosWorkspace({ cashier, onLogout }) {
  const ws = usePosWorkspace(cashier);

  return (
    <div className="flex h-screen flex-col bg-slate-100 text-slate-900">
      {ws.showLogoutModal ? (
        <LogoutConfirmModal
          t={ws.t}
          reason={ws.logoutBlocked ? ws.t('pos.logoutBlockedShift') : ''}
          onCancel={() => ws.setShowLogoutModal(false)}
          onConfirm={() => {
            ws.setShowLogoutModal(false);
            onLogout();
          }}
          onCloseShift={() => {
            ws.setShowLogoutModal(false);
            ws.setShowCloseModal(true);
          }}
        />
      ) : null}

      {ws.orderLookup.open ? (
        <OrderLookupModal t={ws.t} language={ws.i18n.language} lookup={ws.orderLookup} />
      ) : null}

      <PosModals
        t={ws.t}
        language={ws.i18n.language}
        cheque={ws.cheque}
        crossVenueGroup={ws.crossVenueGroup}
        order={ws.order}
        refundCheque={ws.refundCheque}
        openCheques={ws.openCheques}
        tableLabel={ws.tableLabel}
        features={ws.features}
        shift={ws.shift}
        shiftSession={ws.shiftSession}
        tableSession={{
          navigateToTable: ws.navigateToTable,
          selectOpenCheque: ws.selectOpenCheque,
          deleteTable: ws.deleteTable,
        }}
        floorByLabel={ws.floorByLabel}
        modals={ws.modals}
        onAddItemWithModifiers={ws.handleAddItemWithModifiers}
      />

      <PosHeader
        t={ws.t}
        search={ws.search}
        onSearchChange={ws.setSearch}
        tableLabel={ws.tableLabel}
        openCheques={ws.openCheques}
        onOpenTables={() => ws.setShowTableModal(true)}
        shift={ws.shift}
        onCloseShift={() => ws.setShowCloseModal(true)}
        onOrderLookup={ws.orderLookup.openLookup}
        cashierUsername={cashier.username}
        onLogout={() => ws.setShowLogoutModal(true)}
      />

      {ws.needsOpen && !ws.showOpenModal ? (
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-amber-200 bg-amber-50 px-5 py-2 text-sm text-amber-900">
          <span>{ws.t('pos.shiftRequiredBanner')}</span>
          <button
            type="button"
            onClick={ws.promptOpenModal}
            className="shrink-0 rounded-lg bg-primary-to px-3 py-1.5 text-xs font-semibold text-white"
          >
            {ws.t('pos.shiftOpenConfirm')}
          </button>
        </div>
      ) : null}

      {!ws.agentStatus.online ? (
        <div className="shrink-0 border-b border-amber-300 bg-amber-100 px-5 py-2 text-center text-sm font-medium text-amber-900">
          {ws.agentStatus.isCoordinator
            ? ws.t('pos.offlineCoordinator')
            : ws.agentStatus.coordinatorActive
              ? ws.t('pos.offlineLanCoordinator')
              : ws.t('pos.offline')}
          {ws.agentStatus.syncQueueDepth > 0
            ? ` · ${ws.t('pos.syncQueueDepth', { count: ws.agentStatus.syncQueueDepth })}`
            : null}
          {ws.agentStatus.syncFailedCount > 0
            ? ` · ${ws.t('pos.syncFailed', { count: ws.agentStatus.syncFailedCount })}`
            : null}
          {ws.agentStatus.syncProgress?.syncing
            ? ` · ${ws.t('pos.syncInProgress')}`
            : null}
        </div>
      ) : null}

      {ws.coordinatorUnreachable ? (
        <div className="shrink-0 border-b border-red-200 bg-red-50 px-5 py-2 text-center text-sm text-red-800">
          {ws.t('pos.coordinatorUnreachable')}
        </div>
      ) : null}

      {ws.agentStatus.menuStale && ws.agentStatus.online ? (
        <div className="shrink-0 border-b border-amber-200 bg-amber-50 px-5 py-2 text-center text-sm text-amber-900">
          {ws.t('pos.menuStale')}
        </div>
      ) : null}

      {ws.crossSell.offlineBlocked ? (
        <div className="shrink-0 border-b border-slate-200 bg-slate-50 px-5 py-2 text-center text-sm text-slate-700">
          {ws.t('pos.crossVenueOffline')}
        </div>
      ) : null}

      {ws.bannerError ? (
        <div className="shrink-0 border-b border-amber-200 bg-amber-50 px-5 py-2 text-center text-sm font-medium text-amber-800">
          {ws.bannerError}
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1">
        <ReceiptPanel
          t={ws.t}
          language={ws.i18n.language}
          loading={ws.loading}
          cheque={ws.cheque}
          crossVenueGroup={ws.crossVenueGroup}
          order={ws.order}
          tableLabel={ws.tableLabel}
          printerOk={ws.printerOk}
          sending={ws.sending}
          paying={ws.paying}
          onClear={ws.handleClear}
          onSend={ws.onSend}
          onOpenActions={ws.openActionsSheet}
          onPickTable={() => ws.setShowTableModal(true)}
          onEditDiscount={() => ws.modals.openDiscountModal('edit')}
          onPay={ws.onPay}
          payDisabled={!ws.shiftReady}
          onChangeQty={ws.changeQty}
        />

        <div
          className={`relative min-w-0 flex-1 ${!ws.cheque ? 'pointer-events-none opacity-50' : ''}`}
        >
          {!ws.cheque ? (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-slate-100/40 px-6 text-center">
              <p className="max-w-sm rounded-xl bg-white/95 px-4 py-3 text-sm font-medium text-slate-700 shadow-sm ring-1 ring-slate-200">
                {ws.t('pos.selectTableForMenu')}
              </p>
            </div>
          ) : null}

          <CrossSellBar
            t={ws.t}
            language={ws.i18n.language}
            crossSell={ws.crossSell}
            homeVenueId={ws.homeVenueId}
            groupLocked={ws.groupLocked}
          />

          <MenuGrid
            t={ws.t}
            language={ws.i18n.language}
            loading={ws.menuGridLoading}
            menu={ws.menuForGrid}
            activeCategoryId={ws.gridCategoryId}
            onCategoryChange={ws.onGridCategoryChange}
            displayItems={ws.menuDisplayItems}
            order={ws.menuOrder}
            onTapItem={ws.handleTapItem}
          />
        </div>
      </div>

      <KitchenProgress
        enabled={ws.features.kdsEnabled}
        kitchenWatch={ws.kitchenWatch}
        language={ws.i18n.language}
        t={ws.t}
      />

      <footer className="flex shrink-0 items-center justify-between border-t border-slate-200 bg-white px-5 py-2 text-xs text-secondary">
        <span className="flex items-center gap-2">
          <span
            className={`h-2 w-2 rounded-full ${ws.agentStatus.online ? 'bg-primary-to' : 'bg-amber-500'}`}
          />
          {ws.agentStatus.online ? ws.t('pos.online') : ws.t('pos.offline')}
          {ws.agentStatus.syncQueueDepth > 0
            ? ` (${ws.agentStatus.syncQueueDepth})`
            : null}
        </span>
        <span>{ws.timeLabel}</span>
      </footer>
    </div>
  );
}
