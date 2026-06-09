import { useEffect, useRef, useState } from 'react';
import { CloseXIcon } from './icons.jsx';
import { canDeleteCheque, displayChequeTotal, parentOpenCheques } from '../utils/cheque.js';
import { OverlayPortal } from './ModalFrame.jsx';

export function TableSwitchModal({
  openCheques,
  currentChequeId,
  currentTable,
  onClose,
  onSelectCheque,
  onOpenTable,
  onDeleteTable,
  t,
}) {
  const [newTable, setNewTable] = useState('');
  const inputRef = useRef(null);
  const tabs = parentOpenCheques(openCheques);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function handleOpenNew() {
    const target = newTable.trim();
    if (!target) return;
    const result = await onOpenTable(target);
    if (result?.ok !== false) onClose();
  }

  async function handleSelect(tab) {
    if (tab.id === currentChequeId) {
      onClose();
      return;
    }
    const result = await onSelectCheque(tab);
    if (result?.ok !== false) onClose();
  }

  async function handleDelete(tab, event) {
    event.stopPropagation();
    const result = await onDeleteTable(tab);
    if (result?.ok !== false && tab.id === currentChequeId) onClose();
  }

  return (
    <OverlayPortal
      layer="stacked"
      className="fixed inset-0 flex items-end justify-center bg-slate-900/50 p-4 backdrop-blur-sm sm:items-center"
    >
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-2xl">
        <div className="border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">{t('pos.tablesTitle')}</h3>
              <p className="mt-0.5 text-sm text-secondary">{t('pos.tablesSubtitle')}</p>
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
          ) : null}
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {tabs.length > 0 ? (
            <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {tabs.map((tab) => {
                const active = tab.id === currentChequeId;
                const deletable = canDeleteCheque(tab);
                return (
                  <div key={tab.id} className="relative">
                    <button
                      type="button"
                      onClick={() => handleSelect(tab)}
                      className={`w-full rounded-xl border px-3 py-3 text-start transition ${
                        active
                          ? 'border-primary-to bg-blue-50 ring-2 ring-primary-to/30'
                          : 'border-slate-200 bg-white hover:border-primary-to/40 hover:bg-slate-50'
                      }`}
                    >
                      <p className="text-lg font-bold text-slate-900">{tab.tableLabel}</p>
                      <p className="mt-0.5 text-xs text-secondary">
                        {t('pos.chequeNumber', { number: tab.chequeNumber })}
                      </p>
                      <p className="mt-2 text-sm font-semibold text-primary-to">
                        {displayChequeTotal(tab).toFixed(0)} {t('pos.currency')}
                      </p>
                    </button>
                    {deletable ? (
                      <button
                        type="button"
                        onClick={(e) => handleDelete(tab, e)}
                        className="absolute end-1.5 top-1.5 rounded-lg bg-white/90 p-1.5 text-slate-400 shadow-sm ring-1 ring-slate-200 hover:bg-red-50 hover:text-red-600"
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
            <p className="mb-4 text-sm text-secondary">{t('pos.noOpenTables')}</p>
          )}

          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 p-4">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-secondary">
              {t('pos.openNewTable')}
            </p>
            <div className="flex gap-2">
              <input
                ref={inputRef}
                value={newTable}
                onChange={(e) => setNewTable(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleOpenNew();
                }}
                placeholder={t('pos.newTablePlaceholder')}
                className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-center text-lg font-semibold tracking-wide text-slate-900 focus:border-primary-to focus:outline-none focus:ring-2 focus:ring-primary-to/20"
              />
              <button
                type="button"
                onClick={handleOpenNew}
                disabled={!newTable.trim()}
                className="shrink-0 rounded-lg bg-primary-gradient px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
              >
                {t('pos.openTable')}
              </button>
            </div>
            <p className="mt-2 text-xs text-secondary">{t('pos.newTableHint')}</p>
          </div>
        </div>
      </div>
    </OverlayPortal>
  );
}
