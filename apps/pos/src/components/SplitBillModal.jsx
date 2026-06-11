import { useState } from 'react';
import { splittableUnits } from '../utils/cheque.js';
import { OverlayPortal } from './ModalFrame.jsx';

function aggregateUnitKeys(unitKeys) {
  const byItem = new Map();
  for (const key of unitKeys) {
    const itemId = key.split(':')[0];
    byItem.set(itemId, (byItem.get(itemId) ?? 0) + 1);
  }
  return [...byItem.entries()].map(([itemId, quantity]) => ({ itemId, quantity }));
}

export function SplitBillModal({ cheque, language, onConfirm, onCancel, t }) {
  const units = splittableUnits(cheque);
  const [guests, setGuests] = useState(() => [
    { label: t('pos.splitGuest', { n: 1 }), unitKeys: [] },
    { label: t('pos.splitGuest', { n: 2 }), unitKeys: [] },
  ]);

  function toggleUnit(guestIdx, unitKey) {
    setGuests((prev) =>
      prev.map((g, i) => {
        if (i === guestIdx) {
          const has = g.unitKeys.includes(unitKey);
          return {
            ...g,
            unitKeys: has
              ? g.unitKeys.filter((key) => key !== unitKey)
              : [...g.unitKeys, unitKey],
          };
        }
        return { ...g, unitKeys: g.unitKeys.filter((key) => key !== unitKey) };
      }),
    );
  }

  const assigned = new Set(guests.flatMap((g) => g.unitKeys));
  const splits = guests
    .map((guest) => ({
      label: guest.label,
      items: aggregateUnitKeys(guest.unitKeys),
    }))
    .filter((guest) => guest.items.length > 0);

  return (
    <OverlayPortal layer="stacked" className="fixed inset-0 flex items-center justify-center bg-slate-900/40 p-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!splits.length) return;
          onConfirm({ splits });
        }}
        className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-xl border border-slate-200 bg-white p-6 shadow-xl"
      >
        <h3 className="mb-1 text-xl font-bold text-slate-900">{t('pos.splitTitle')}</h3>
        <p className="mb-4 text-sm text-secondary">{t('pos.splitSelectItems')}</p>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
          {guests.map((guest, guestIdx) => (
            <div key={guest.label} className="rounded-lg border border-slate-200 p-3">
              <p className="mb-2 font-medium text-slate-900">{guest.label}</p>
              <ul className="space-y-1">
                {units.map((unit) => {
                  const checked = guest.unitKeys.includes(unit.unitKey);
                  const takenElsewhere = assigned.has(unit.unitKey) && !checked;
                  const name = language === 'ar' ? unit.nameAr : unit.nameEn;
                  return (
                    <li key={unit.unitKey}>
                      <label
                        className={`flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm ${
                          takenElsewhere ? 'opacity-40' : 'hover:bg-slate-50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={takenElsewhere}
                          onChange={() => toggleUnit(guestIdx, unit.unitKey)}
                        />
                        <span className="flex-1">{name}</span>
                        <span className="text-secondary">
                          {unit.unitPrice.toFixed(2)} {t('pos.currency')}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-4 flex gap-3">
          <button
            type="submit"
            disabled={!splits.length}
            className="flex-1 rounded-lg bg-primary-gradient py-3 font-semibold text-white disabled:opacity-50"
          >
            {t('pos.splitConfirm')}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-slate-300 px-4 py-3 text-secondary hover:bg-slate-50"
          >
            {t('common.cancel')}
          </button>
        </div>
      </form>
    </OverlayPortal>
  );
}
