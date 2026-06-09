import { useState } from 'react';
import { itemName } from '../utils/orderLine.js';
import { OverlayPortal } from './ModalFrame.jsx';

export function ModifierModal({ item, language, onConfirm, onCancel, t }) {
  const [selected, setSelected] = useState({});

  function toggle(group, option) {
    setSelected((prev) => {
      const current = prev[group.id] ?? [];
      const exists = current.find((o) => o.optionId === option.id);
      let next;
      if (exists) {
        next = current.filter((o) => o.optionId !== option.id);
      } else if (group.maxSelection === 1) {
        next = [
          {
            groupId: group.id,
            optionId: option.id,
            nameEn: option.nameEn,
            nameAr: option.nameAr,
            priceDelta: option.priceDelta,
          },
        ];
      } else {
        next = [
          ...current,
          {
            groupId: group.id,
            optionId: option.id,
            nameEn: option.nameEn,
            nameAr: option.nameAr,
            priceDelta: option.priceDelta,
          },
        ];
      }
      return { ...prev, [group.id]: next };
    });
  }

  function handleConfirm() {
    for (const group of item.modifierGroups ?? []) {
      const count = (selected[group.id] ?? []).length;
      if (count < group.minSelection) {
        alert(t('pos.modifierMin', { name: itemName(group, language), count: group.minSelection }));
        return;
      }
    }
    onConfirm(Object.values(selected).flat());
  }

  return (
    <OverlayPortal layer="stacked" className="fixed inset-0 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
        <h3 className="mb-4 text-xl font-bold text-slate-900">{itemName(item, language)}</h3>
        {(item.modifierGroups ?? []).map((group) => (
          <div key={group.id} className="mb-4">
            <p className="mb-2 font-medium text-slate-700">{itemName(group, language)}</p>
            <div className="flex flex-wrap gap-2">
              {group.options?.map((opt) => {
                const active = (selected[group.id] ?? []).some((o) => o.optionId === opt.id);
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => toggle(group, opt)}
                    className={`rounded-lg px-3 py-2 text-sm ${
                      active
                        ? 'bg-primary-gradient text-white'
                        : 'border border-secondary/40 bg-slate-50 text-slate-700 hover:border-secondary'
                    }`}
                  >
                    {itemName(opt, language)}
                    {opt.priceDelta > 0 ? ` (+${opt.priceDelta})` : ''}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        <div className="mt-4 flex gap-3">
          <button
            type="button"
            onClick={handleConfirm}
            className="rounded-lg bg-primary-gradient px-4 py-2 font-semibold text-white hover:opacity-90"
          >
            {t('common.save')}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-secondary/50 px-4 py-2 text-secondary hover:bg-slate-50"
          >
            {t('common.cancel')}
          </button>
        </div>
      </div>
    </OverlayPortal>
  );
}
