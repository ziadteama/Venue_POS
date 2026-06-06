import { useState } from 'react';
import { splittableItems } from '../utils/cheque.js';

export function SplitBillModal({ cheque, language, onConfirm, onCancel, t }) {
  const items = splittableItems(cheque);
  const [guests, setGuests] = useState(() => [
    { label: t('pos.splitGuest', { n: 1 }), itemIds: [] },
    { label: t('pos.splitGuest', { n: 2 }), itemIds: [] },
  ]);

  function toggleItem(guestIdx, itemId) {
    setGuests((prev) =>
      prev.map((g, i) => {
        if (i === guestIdx) {
          const has = g.itemIds.includes(itemId);
          return {
            ...g,
            itemIds: has ? g.itemIds.filter((id) => id !== itemId) : [...g.itemIds, itemId],
          };
        }
        return { ...g, itemIds: g.itemIds.filter((id) => id !== itemId) };
      }),
    );
  }

  const assigned = new Set(guests.flatMap((g) => g.itemIds));
  const splits = guests.filter((g) => g.itemIds.length > 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!splits.length) return;
          onConfirm({
            splits: splits.map((g) => ({ label: g.label, itemIds: g.itemIds })),
          });
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
                {items.map((item) => {
                  const checked = guest.itemIds.includes(item.id);
                  const takenElsewhere = assigned.has(item.id) && !checked;
                  return (
                    <li key={item.id}>
                      <label
                        className={`flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm ${
                          takenElsewhere ? 'opacity-40' : 'hover:bg-slate-50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={takenElsewhere}
                          onChange={() => toggleItem(guestIdx, item.id)}
                        />
                        <span>
                          {item.quantity}x {language === 'ar' ? item.nameAr : item.nameEn}
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
    </div>
  );
}
