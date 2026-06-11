import { CloseXIcon } from './icons.jsx';
import { useEffect } from 'react';
import {
  canDeleteCheque,
  displayChequeTotal,
  findOpenChequeForLabel,
  findOpenTakeawayCheque,
  hasOpenSplitChildren,
  isHubTableBlocked,
  isTakeawayCheque,
  parentOpenCheques,
} from '../utils/cheque.js';
import { OverlayPortal } from './ModalFrame.jsx';

function tableStatus({ openCheque, currentChequeId }) {
  if (!openCheque) return 'free';
  if (openCheque.id === currentChequeId) return 'current';
  return 'occupied';
}

export function buildFloorTiles({
  venueTables,
  openCheques,
  currentChequeId,
  currentCrossVenueGroupId,
  floorByLabel,
}) {
  const parents = parentOpenCheques(openCheques);
  const baseLabels =
    venueTables.length > 0
      ? [...venueTables]
      : [...new Set([...parents.map((c) => c.tableLabel), ...(floorByLabel?.keys() ?? [])])].sort(
          (a, b) => a.localeCompare(b, undefined, { numeric: true }),
        );

  const matchedIds = new Set();
  const tiles = baseLabels.map((label) => {
    const cheque = findOpenChequeForLabel(label, openCheques, floorByLabel);
    if (cheque) matchedIds.add(cheque.id);
    let status = tableStatus({ openCheque: cheque, currentChequeId });
    if (
      status === 'free' &&
      isHubTableBlocked(label, {
        floorByLabel,
        chequeId: currentChequeId,
        crossVenueGroupId: currentCrossVenueGroupId,
      })
    ) {
      status = 'occupied';
    }
    return { key: cheque?.id ?? label, label, cheque, status };
  });

  for (const cheque of parents) {
    if (matchedIds.has(cheque.id)) continue;
    tiles.push({
      key: cheque.id,
      label: cheque.tableLabel,
      cheque,
      status: tableStatus({ openCheque: cheque, currentChequeId }),
    });
  }

  return tiles;
}

export function TableFloorModal({
  venueTables = [],
  openCheques,
  currentCheque,
  currentChequeId,
  currentCrossVenueGroupId,
  currentTable,
  floorByLabel,
  onClose,
  onSelectTable,
  onDeleteCheque,
  onRefreshOpenCheques,
  t,
}) {
  const tiles = buildFloorTiles({
    venueTables,
    openCheques,
    currentChequeId,
    currentCrossVenueGroupId,
    floorByLabel,
  });
  const hasAssigned = venueTables.length > 0;
  const takeawayTab = findOpenTakeawayCheque(openCheques);
  const activeTabs = parentOpenCheques(openCheques).filter((tab) => !isTakeawayCheque(tab));

  useEffect(() => {
    onRefreshOpenCheques?.();
  }, [onRefreshOpenCheques]);

  async function handlePick(tile) {
    if (tile.status === 'current') {
      onClose();
      return;
    }
    if (tile.status === 'occupied' && !tile.cheque) return;
    const result = await onSelectTable(tile.label, tile.cheque);
    if (result?.ok !== false) onClose();
  }

  async function handleDelete(tile, event) {
    event.stopPropagation();
    const chequeForTile =
      tile.cheque?.id === currentChequeId && currentCheque ? currentCheque : tile.cheque;
    if (!chequeForTile) return;
    const result = await onDeleteCheque(chequeForTile);
    if (result?.ok !== false && chequeForTile.id === currentChequeId) onClose();
  }

  async function handleSelectActive(tab) {
    if (tab.id === currentChequeId) {
      onClose();
      return;
    }
    const result = await onSelectTable(tab.tableLabel, tab);
    if (result?.ok !== false) onClose();
  }

  async function handleDeleteActive(tab, event) {
    event.stopPropagation();
    const chequeForTab = tab.id === currentChequeId && currentCheque ? currentCheque : tab;
    const result = await onDeleteCheque(chequeForTab);
    if (result?.ok !== false && chequeForTab.id === currentChequeId) onClose();
  }

  return (
    <OverlayPortal
      layer="stacked"
      className="fixed inset-0 flex items-end justify-center bg-slate-900/50 p-4 backdrop-blur-sm sm:items-center"
    >
      <div className="flex max-h-[96vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white px-6 py-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-2xl font-semibold text-slate-900">{t('pos.floorTitle')}</h3>
              <p className="mt-1 text-base text-secondary">
                {hasAssigned ? t('pos.floorSubtitleAssigned') : t('pos.floorSubtitleOpenOnly')}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-secondary hover:bg-slate-100"
              aria-label={t('common.cancel')}
            >
              <CloseXIcon className="h-5 w-5" />
            </button>
          </div>
          {currentTable ? (
            <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-primary-gradient px-3 py-1 text-xs font-medium text-white">
              {t('pos.currentTableBadge', { table: currentTable })}
            </p>
          ) : (
            <p className="mt-2 text-sm font-medium text-amber-800">{t('pos.pickTableToStart')}</p>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {takeawayTab ? (
            <div className="mb-5 rounded-2xl border border-emerald-200/80 bg-emerald-50/60 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-900">
                {t('pos.takeAway')}
              </p>
              <div className="mt-3">
                {(() => {
                  const chequeForTakeaway =
                    takeawayTab.id === currentChequeId && currentCheque
                      ? currentCheque
                      : takeawayTab;
                  const takeawayDeletable = canDeleteCheque(chequeForTakeaway);
                  return (
                    <div className="relative inline-block">
                      <button
                        type="button"
                        onClick={() => handleSelectActive(takeawayTab)}
                        className={`rounded-xl border px-3 py-2 text-start text-sm transition ${
                          takeawayTab.id === currentChequeId
                            ? 'border-primary-to bg-white text-slate-900 ring-2 ring-primary-to/30'
                            : 'border-emerald-300 bg-white text-slate-800 hover:border-primary-to/40'
                        }`}
                      >
                        <span className="font-semibold">{t('pos.takeAway')}</span>
                        <span className="mt-0.5 block text-xs text-secondary">
                          #{takeawayTab.chequeNumber} ·{' '}
                          {displayChequeTotal(chequeForTakeaway).toFixed(0)} {t('pos.currency')}
                        </span>
                      </button>
                      {takeawayDeletable ? (
                        <button
                          type="button"
                          onClick={(e) => handleDeleteActive(takeawayTab, e)}
                          className="absolute end-1 top-1 rounded-lg bg-white/95 p-1 text-slate-400 shadow-sm ring-1 ring-slate-200 hover:bg-red-50 hover:text-red-600"
                          title={t('pos.closeTakeAway')}
                          aria-label={t('pos.closeTakeAway')}
                        >
                          <CloseXIcon className="h-4 w-4" />
                        </button>
                      ) : null}
                    </div>
                  );
                })()}
              </div>
            </div>
          ) : null}

          {activeTabs.length > 0 ? (
            <div className="mb-5 rounded-2xl border border-amber-200/80 bg-amber-50/60 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-900">
                {t('pos.activeTablesTitle', { count: activeTabs.length })}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {activeTabs.map((tab) => {
                  const isCurrent = tab.id === currentChequeId;
                  const chequeForTab =
                    isCurrent && currentCheque ? currentCheque : tab;
                  const deletable = canDeleteCheque(chequeForTab);
                  return (
                    <div key={tab.id} className="relative">
                      <button
                        type="button"
                        onClick={() => handleSelectActive(tab)}
                        className={`rounded-xl border px-3 py-2 text-start text-sm transition ${
                          isCurrent
                            ? 'border-primary-to bg-blue-50 text-slate-900 ring-2 ring-primary-to/30'
                            : 'border-amber-300 bg-white text-slate-800 hover:border-primary-to/40'
                        }`}
                      >
                        <span className="font-semibold">{tab.tableLabel}</span>
                        <span className="mt-0.5 block text-xs text-secondary">
                          #{tab.chequeNumber} · {displayChequeTotal(chequeForTab).toFixed(0)}{' '}
                          {t('pos.currency')}
                          {hasOpenSplitChildren(chequeForTab) ? ` · ${t('pos.splitSettleTitle')}` : ''}
                        </span>
                      </button>
                      {deletable ? (
                        <button
                          type="button"
                          onClick={(e) => handleDeleteActive(tab, e)}
                          className="absolute end-1 top-1 rounded-lg bg-white/95 p-1 text-slate-400 shadow-sm ring-1 ring-slate-200 hover:bg-red-50 hover:text-red-600"
                          title={t('pos.deleteTable')}
                          aria-label={t('pos.deleteTable')}
                        >
                          <CloseXIcon className="h-4 w-4" />
                        </button>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {tiles.length > 0 ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {tiles.map((tile) => {
                const chequeForTile =
                  tile.cheque?.id === currentChequeId && currentCheque
                    ? currentCheque
                    : tile.cheque;
                const deletable = chequeForTile && canDeleteCheque(chequeForTile);
                const hubBlocked = tile.status === 'occupied' && !tile.cheque;
                const statusClass =
                  tile.status === 'current'
                    ? 'border-primary-to bg-blue-50 ring-2 ring-primary-to/30'
                    : hubBlocked
                      ? 'cursor-not-allowed border-slate-200 bg-slate-50 opacity-80'
                      : tile.status === 'occupied'
                        ? 'border-amber-300 bg-amber-50/80'
                        : 'border-slate-200 bg-white hover:border-emerald-400 hover:bg-emerald-50/50';

                return (
                  <div key={tile.key} className="relative">
                    <button
                      type="button"
                      disabled={hubBlocked}
                      onClick={() => handlePick(tile)}
                      className={`flex min-h-[7.5rem] w-full flex-col justify-between rounded-2xl border p-4 text-start transition ${statusClass}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-2xl font-bold text-slate-900">{tile.label}</span>
                        <span
                          className={`rounded-full px-2 py-1 text-[11px] font-semibold uppercase ${
                            tile.status === 'free'
                              ? 'bg-emerald-100 text-emerald-800'
                              : tile.status === 'current'
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-amber-100 text-amber-900'
                          }`}
                        >
                          {tile.status === 'free'
                            ? t('pos.tableFree')
                            : tile.status === 'current'
                              ? t('pos.tableCurrent')
                              : t('pos.tableBusy')}
                        </span>
                      </div>
                      {chequeForTile ? (
                        <div className="mt-3 text-sm text-secondary">
                          <p className="font-semibold text-primary-to">
                            {displayChequeTotal(chequeForTile).toFixed(0)} {t('pos.currency')}
                          </p>
                          <p>
                            #{chequeForTile.chequeNumber}
                            {hasOpenSplitChildren(chequeForTile) ? ` · ${t('pos.splitSettleTitle')}` : ''}
                          </p>
                        </div>
                      ) : (
                        <p className="mt-3 text-sm text-emerald-700">{t('pos.tableTapOpen')}</p>
                      )}
                    </button>
                    {deletable ? (
                      <button
                        type="button"
                        onClick={(e) => handleDelete(tile, e)}
                        className="absolute end-2 top-2 rounded-xl bg-white/95 p-1.5 text-slate-400 shadow-sm ring-1 ring-slate-200 hover:bg-red-50 hover:text-red-600"
                        title={t('pos.deleteTable')}
                        aria-label={t('pos.deleteTable')}
                      >
                        <CloseXIcon className="h-5 w-5" />
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center">
              <p className="text-sm font-medium text-slate-700">{t('pos.noTablesConfigured')}</p>
              <p className="mt-1 text-xs text-secondary">{t('pos.noTablesConfiguredHint')}</p>
            </div>
          )}
        </div>
      </div>
    </OverlayPortal>
  );
}
