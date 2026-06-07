import { canDeleteCheque, parentOpenCheques } from '../utils/cheque.js';

function tableStatus({ label, openCheque, currentChequeId }) {
  if (!openCheque) return 'free';
  if (openCheque.id === currentChequeId) return 'current';
  return 'occupied';
}

export function buildFloorTiles({ venueTables, openCheques, currentChequeId }) {
  const openByLabel = new Map();
  for (const tab of parentOpenCheques(openCheques)) {
    openByLabel.set(tab.tableLabel, tab);
  }

  const labels =
    venueTables.length > 0
      ? venueTables
      : [...openByLabel.keys()].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  return labels.map((label) => {
    const cheque = openByLabel.get(label) ?? null;
    return {
      label,
      cheque,
      status: tableStatus({ label, openCheque: cheque, currentChequeId }),
    };
  });
}

export function TableFloorModal({
  venueTables = [],
  openCheques,
  currentChequeId,
  currentTable,
  onClose,
  onSelectTable,
  onDeleteCheque,
  t,
}) {
  const tiles = buildFloorTiles({ venueTables, openCheques, currentChequeId });
  const hasAssigned = venueTables.length > 0;

  async function handlePick(tile) {
    if (tile.status === 'current') {
      onClose();
      return;
    }
    const result = await onSelectTable(tile.label, tile.cheque);
    if (result?.ok !== false) onClose();
  }

  async function handleDelete(tile, event) {
    event.stopPropagation();
    if (!tile.cheque) return;
    const result = await onDeleteCheque(tile.cheque);
    if (result?.ok !== false && tile.cheque.id === currentChequeId) onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-4 backdrop-blur-sm sm:items-center">
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">{t('pos.floorTitle')}</h3>
              <p className="mt-0.5 text-sm text-secondary">
                {hasAssigned ? t('pos.floorSubtitleAssigned') : t('pos.floorSubtitleOpenOnly')}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-secondary hover:bg-slate-100"
              aria-label={t('common.cancel')}
            >
              ✕
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

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {tiles.length > 0 ? (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {tiles.map((tile) => {
                const deletable = tile.cheque && canDeleteCheque(tile.cheque);
                const statusClass =
                  tile.status === 'current'
                    ? 'border-primary-to bg-blue-50 ring-2 ring-primary-to/30'
                    : tile.status === 'occupied'
                      ? 'border-amber-300 bg-amber-50/80'
                      : 'border-slate-200 bg-white hover:border-emerald-400 hover:bg-emerald-50/50';

                return (
                  <div key={tile.label} className="relative">
                    <button
                      type="button"
                      onClick={() => handlePick(tile)}
                      className={`flex min-h-[5.5rem] w-full flex-col justify-between rounded-xl border p-3 text-start transition ${statusClass}`}
                    >
                      <div className="flex items-start justify-between gap-1">
                        <span className="text-lg font-bold text-slate-900">{tile.label}</span>
                        <span
                          className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
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
                      {tile.cheque ? (
                        <div className="mt-2 text-xs text-secondary">
                          <p className="font-semibold text-primary-to">
                            {tile.cheque.total.toFixed(0)} {t('pos.currency')}
                          </p>
                          <p>#{tile.cheque.chequeNumber}</p>
                        </div>
                      ) : (
                        <p className="mt-2 text-xs text-emerald-700">{t('pos.tableTapOpen')}</p>
                      )}
                    </button>
                    {deletable ? (
                      <button
                        type="button"
                        onClick={(e) => handleDelete(tile, e)}
                        className="absolute end-1 top-1 rounded-lg bg-white/90 p-1 text-slate-400 shadow-sm ring-1 ring-slate-200 hover:bg-red-50 hover:text-red-600"
                        title={t('pos.deleteTable')}
                        aria-label={t('pos.deleteTable')}
                      >
                        ✕
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
    </div>
  );
}
