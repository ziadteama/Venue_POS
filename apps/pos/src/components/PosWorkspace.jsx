import { KitchenProgress } from './KitchenProgress.jsx';
import { MenuGrid } from './MenuGrid.jsx';
import { PosErrorToast } from './PosErrorToast.jsx';
import { PosHeader } from './PosHeader.jsx';
import { PosModals } from './PosModals.jsx';
import { ReceiptPanel } from './ReceiptPanel.jsx';
import { OrderLookupModal } from './OrderLookupModal.jsx';
import { CrossSellBar } from './CrossSellBar.jsx';
import { LogoutConfirmModal } from './LogoutConfirmModal.jsx';
import { usePosWorkspace } from '../hooks/usePosWorkspace.js';

export function PosWorkspace({ cashier, onLogout }) {
  const ws = usePosWorkspace(cashier);

  const overlayOpen =
    ws.modals.isAnyModalOpen ||
    ws.showLogoutModal ||
    ws.orderLookup.open ||
    ws.showOpenModal ||
    ws.shiftSession.showCloseModal;

  const modalShowsInlineError =
    Boolean(ws.error) &&
    (ws.modals.showRefundModal ||
      ws.modals.showDiscountModal ||
      ws.modals.showRefundPicker ||
      ws.modals.showPayModal);

  const showErrorToast = Boolean(ws.bannerError) && overlayOpen && !modalShowsInlineError;

  return (
    <div className="flex h-screen flex-col bg-surface-base text-slate-900">
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
        error={ws.error}
        onAddItemWithModifiers={ws.handleAddItemWithModifiers}
        refreshOpenCheques={ws.refreshOpenCheques}
        refreshFloor={ws.refreshFloor}
      />

      <PosHeader
        t={ws.t}
        search={ws.search}
        onSearchChange={ws.setSearch}
        tableLabel={ws.tableLabel}
        serviceMode={ws.cheque?.serviceMode}
        openCheques={ws.openCheques}
        onOpenTables={() => ws.openTables()}
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

      {!ws.agentStatus.agentReachable ? (
        <div className="shrink-0 border-b border-red-300 bg-red-100 px-5 py-2 text-center text-sm font-medium text-red-900">
          {ws.t('pos.agentUnreachable')}
        </div>
      ) : null}

      {ws.agentStatus.agentReachable && !ws.agentStatus.online ? (
        <div className="flex shrink-0 items-center justify-center gap-3 border-b border-amber-300 bg-amber-100 px-5 py-2 text-center text-sm font-medium text-amber-900">
          <span>
            {ws.agentStatus.clusterMode === 'leader' || ws.agentStatus.isCoordinator
              ? ws.t('pos.offlineLeader')
              : ws.agentStatus.clusterMode === 'follower'
                ? ws.agentStatus.leaderPeerLabel
                  ? ws.t('pos.offlineFollowerVia', { name: ws.agentStatus.leaderPeerLabel })
                  : ws.t('pos.offlineFollower')
                : ws.agentStatus.clusterMode === 'relay'
                  ? ws.agentStatus.relayPeerLabel
                    ? ws.t('pos.offlineRelayVia', { name: ws.agentStatus.relayPeerLabel })
                    : ws.t('pos.offlineRelay')
                  : ws.agentStatus.clusterMode === 'electing'
                    ? ws.t('pos.offlineElecting')
                    : ws.agentStatus.coordinatorActive
                      ? ws.t('pos.offlineLanCoordinator')
                      : ws.t('pos.offline')}
            {ws.agentStatus.syncQueueDepth > 0
              ? ` | ${ws.t('pos.syncQueueDepth', { count: ws.agentStatus.syncQueueDepth })}`
              : null}
            {ws.agentStatus.syncProgress?.syncing
              ? ` | ${
                  ws.agentStatus.syncProgress.drainTotal
                    ? ws.t('pos.syncProgress', {
                        done: ws.agentStatus.syncProgress.drainDone ?? 0,
                        total: ws.agentStatus.syncProgress.drainTotal,
                      })
                    : ws.t('pos.syncInProgress')
                }`
              : null}
          </span>
        </div>
      ) : null}

      {ws.agentStatus.agentReachable &&
      ws.agentStatus.online &&
      (ws.agentStatus.syncQueueDepth > 0 || ws.agentStatus.syncProgress?.syncing) ? (
        <div className="shrink-0 border-b border-slate-200 bg-slate-50 px-5 py-1.5 text-center text-xs text-slate-600">
          {ws.agentStatus.syncProgress?.syncing && ws.agentStatus.syncProgress.drainTotal
            ? ws.t('pos.syncProgress', {
                done: ws.agentStatus.syncProgress.drainDone ?? 0,
                total: ws.agentStatus.syncProgress.drainTotal,
              })
            : ws.t('pos.syncInProgress')}
        </div>
      ) : null}

      {ws.managerNotice ? (
        <div className="flex shrink-0 items-center justify-center gap-3 border-b border-blue-200 bg-blue-50 px-5 py-2 text-center text-sm text-blue-900">
          <span>
            {ws.managerNotice.self
              ? ws.t('pos.refundSuccess', {
                  number: ws.managerNotice.payload.chequeNumber,
                  amount: Number(ws.managerNotice.payload.amount ?? 0).toFixed(2),
                  currency: ws.t('pos.currency'),
                  method: ws.managerNotice.payload.method ?? 'cash',
                })
              : ws.t('pos.refundNotification', {
                  number: ws.managerNotice.payload.chequeNumber,
                  amount: Number(ws.managerNotice.payload.amount ?? 0).toFixed(2),
                  method: ws.managerNotice.payload.method ?? 'cash',
                  manager:
                    ws.managerNotice.payload.managerName ??
                    ws.managerNotice.payload.cashierName ??
                    ws.t('pos.floorManager'),
                })}
          </span>
          <button
            type="button"
            onClick={() => ws.setManagerNotice(null)}
            className="shrink-0 rounded border border-blue-300 px-2 py-0.5 text-xs font-medium hover:bg-blue-100"
          >
            {ws.t('pos.dismissNotification')}
          </button>
        </div>
      ) : null}

      {ws.coordinatorUnreachable ? (
        <div className="shrink-0 border-b border-red-200 bg-red-50 px-5 py-2 text-center text-sm text-red-800">
          {ws.t('pos.coordinatorUnreachable')}
        </div>
      ) : null}

      {ws.crossSell.offlineBlocked ? (
        <div className="shrink-0 border-b border-slate-200 bg-slate-50 px-5 py-2 text-center text-sm text-slate-700">
          {ws.t('pos.crossVenueOffline')}
        </div>
      ) : null}

      {showErrorToast ? (
        <PosErrorToast
          message={ws.bannerError}
          onDismiss={() => {
            ws.setError('');
            ws.shiftSession.setError('');
          }}
          t={ws.t}
        />
      ) : null}

      {ws.bannerError && !overlayOpen ? (
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
          onPickTable={() => ws.openTables()}
          onPickTakeaway={() => ws.openTakeawayCheque()}
          onEditDiscount={() => ws.modals.openDiscountModal('edit')}
          onPay={ws.onPay}
          payDisabled={!ws.shiftReady}
          onPrintCheck={ws.onPrintCheck}
          onPrintFullSplit={ws.onPrintFullSplit}
          printing={ws.modals.splitPrinting}
          onChangeQty={ws.changeQty}
          onMoveTable={() => ws.modals.setShowMoveTableModal(true)}
          onFreeTable={ws.freeTable}
        />

        <div className={`relative min-w-0 flex-1 ${!ws.cheque ? 'opacity-50' : ''}`}>
          {!ws.cheque ? (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-slate-100/40 px-6 text-center">
              <span className="max-w-sm rounded-xl bg-white/95 px-4 py-3 text-sm font-medium text-slate-700 shadow-sm ring-1 ring-slate-200">
                {ws.t('pos.selectServiceForMenu')}
              </span>
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
            className={`h-2 w-2 rounded-full ${
              !ws.agentStatus.agentReachable
                ? 'bg-red-500'
                : ws.agentStatus.online
                  ? 'bg-primary-to'
                  : 'bg-amber-500'
            }`}
          />
          {!ws.agentStatus.agentReachable
            ? ws.t('pos.agentUnreachable')
            : ws.agentStatus.online
              ? ws.t('pos.online')
              : ws.t('pos.offline')}
          {ws.agentStatus.syncQueueDepth > 0
            ? ` (${ws.agentStatus.syncQueueDepth})`
            : null}
        </span>
        <span>{ws.timeLabel}</span>
      </footer>
    </div>
  );
}
