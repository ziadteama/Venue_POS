import { useMemo, useState } from 'react';
import { displayInitial, menuLabel } from '../../utils/menuLabel.js';

export function MenuPreviewModal({ t, detail, language, onClose }) {
  const [activeCategoryId, setActiveCategoryId] = useState('all');

  const allItems = useMemo(
    () => detail?.categories?.flatMap((c) => c.items ?? []) ?? [],
    [detail],
  );

  const displayItems = useMemo(() => {
    if (activeCategoryId === 'all') return allItems.filter((i) => i.isAvailable);
    const category = detail?.categories?.find((c) => c.id === activeCategoryId);
    return (category?.items ?? []).filter((i) => i.isAvailable);
  }, [activeCategoryId, allItems, detail]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-slate-100 shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
          <div>
            <h3 className="font-semibold text-slate-900">{t('menu.previewTitle')}</h3>
            <p className="text-sm text-secondary">{t('menu.previewHint')}</p>
          </div>
          <button type="button" className="rounded-lg border px-3 py-1.5 text-sm" onClick={onClose}>
            {t('common.cancel')}
          </button>
        </div>

        <div className="flex shrink-0 gap-2 overflow-x-auto border-b border-slate-200 bg-white px-4 py-3">
          <button
            type="button"
            onClick={() => setActiveCategoryId('all')}
            className={`shrink-0 rounded-lg px-4 py-2 text-sm font-medium ${
              activeCategoryId === 'all'
                ? 'bg-primary-gradient text-white shadow-sm'
                : 'bg-slate-50 text-secondary'
            }`}
          >
            {t('menu.previewAllItems')}
          </button>
          {detail?.categories?.map((category) => (
            <button
              key={category.id}
              type="button"
              onClick={() => setActiveCategoryId(category.id)}
              className={`shrink-0 rounded-lg px-4 py-2 text-sm font-medium ${
                activeCategoryId === category.id
                  ? 'bg-primary-gradient text-white shadow-sm'
                  : 'bg-slate-50 text-secondary'
              }`}
            >
              {menuLabel(category, language)}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
            {displayItems.map((item) => (
              <div
                key={item.id}
                className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
              >
                <div className="flex h-24 items-center justify-center bg-gradient-to-br from-primary-from/10 to-primary-to/10">
                  <span className="text-3xl font-bold text-primary-from/40">
                    {displayInitial(menuLabel(item, language))}
                  </span>
                </div>
                <div className="p-3">
                  <p className="font-semibold text-slate-900">{menuLabel(item, language)}</p>
                  <p className="mt-2 font-semibold text-primary-to">
                    {item.price.toFixed(2)} {t('pos.currency')}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
