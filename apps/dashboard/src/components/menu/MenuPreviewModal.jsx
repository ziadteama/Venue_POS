import { useMemo, useState } from 'react';
import { displayInitial, menuLabel } from '../../utils/menuLabel.js';
import { Drawer } from '../ui/Drawer.jsx';
import { SegmentedControl } from '../ui/SegmentedControl.jsx';

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

  const tabs = useMemo(
    () => [
      { value: 'all', label: t('menu.previewAllItems') },
      ...(detail?.categories ?? []).map((c) => ({ value: c.id, label: menuLabel(c, language) })),
    ],
    [detail, language, t],
  );

  return (
    <Drawer onClose={onClose} size="2xl" title={t('menu.previewTitle')} subtitle={t('menu.previewHint')}>
      <div className="mb-4">
        <SegmentedControl
          variant="pill"
          options={tabs}
          value={activeCategoryId}
          onChange={setActiveCategoryId}
        />
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        {displayItems.map((item) => (
          <div
            key={item.id}
            className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-card"
          >
            <div className="flex h-24 items-center justify-center bg-gradient-to-br from-accent-500/10 to-accent-600/10">
              <span className="text-3xl font-bold text-accent-600/40">
                {displayInitial(menuLabel(item, language))}
              </span>
            </div>
            <div className="p-3">
              <p className="font-semibold text-slate-900">{menuLabel(item, language)}</p>
              <p className="mt-2 font-semibold text-accent-700">
                {item.price.toFixed(2)} {t('pos.currency')}
              </p>
            </div>
          </div>
        ))}
      </div>
    </Drawer>
  );
}
