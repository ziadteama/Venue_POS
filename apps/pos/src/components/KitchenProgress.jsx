import { itemName } from '../utils/orderLine.js';

export function KitchenProgress({ kitchenWatch, language, t, enabled = true }) {
  if (!enabled || !kitchenWatch) return null;

  return (
    <div className="shrink-0 border-t border-slate-200 bg-slate-50 px-5 py-3">
      <p className="mb-2 text-sm font-semibold text-slate-800">
        {t('pos.kitchenProgress', { number: kitchenWatch.orderNumber ?? '-' })}
      </p>
      <div className="flex flex-wrap gap-2">
        {kitchenWatch.items?.map((line) => {
          const status = line.kitchenStatus ?? 'pending';
          return (
            <span
              key={line.id}
              className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-700 ring-1 ring-slate-200"
            >
              {itemName(line, language)} - {t(`pos.itemStatus.${status}`)}
            </span>
          );
        })}
      </div>
    </div>
  );
}
