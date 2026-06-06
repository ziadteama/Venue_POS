import { displayInitial, itemName } from '../utils/orderLine.js';

export function MenuGrid({
  t,
  language,
  loading,
  menu,
  activeCategoryId,
  onCategoryChange,
  displayItems,
  order,
  onTapItem,
}) {
  return (
    <main className="flex min-w-0 flex-1 flex-col">
      <div className="flex shrink-0 gap-2 overflow-x-auto border-b border-slate-200 bg-white px-4 py-3">
        <button
          type="button"
          onClick={() => onCategoryChange('all')}
          className={`shrink-0 rounded-lg px-4 py-2 text-sm font-medium ${
            activeCategoryId === 'all'
              ? 'bg-primary-gradient text-white shadow-sm'
              : 'bg-slate-50 text-secondary hover:bg-slate-100 hover:text-slate-700'
          }`}
        >
          {t('pos.allItems')}
        </button>
        {menu?.categories?.map((category) => (
          <button
            key={category.id}
            type="button"
            onClick={() => onCategoryChange(category.id)}
            className={`shrink-0 rounded-lg px-4 py-2 text-sm font-medium ${
              activeCategoryId === category.id
                ? 'bg-primary-gradient text-white shadow-sm'
                : 'bg-slate-50 text-secondary hover:bg-slate-100 hover:text-slate-700'
            }`}
          >
            {itemName(category, language)}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <p className="text-secondary">{t('common.loading')}</p>
        ) : (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
            {displayItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onTapItem(item)}
                disabled={!item.isAvailable || order?.status !== 'draft'}
                className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white text-start shadow-sm transition hover:border-primary-to/40 hover:shadow-md disabled:opacity-40"
              >
                <div className="flex h-28 items-center justify-center bg-gradient-to-br from-primary-from/10 to-primary-to/10">
                  <span className="text-3xl font-bold text-primary-from/40">
                    {displayInitial(itemName(item, language))}
                  </span>
                </div>
                <div className="flex flex-1 flex-col justify-between p-3">
                  <span className="font-semibold text-slate-900">{itemName(item, language)}</span>
                  <span className="mt-2 font-semibold text-primary-to">
                    {item.price.toFixed(2)} {t('pos.currency')}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
