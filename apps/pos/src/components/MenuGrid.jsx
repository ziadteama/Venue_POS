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
      <div className="scrollbar-slim flex shrink-0 gap-2 overflow-x-auto border-b border-slate-200/70 bg-white px-4 py-3">
        <button
          type="button"
          onClick={() => onCategoryChange('all')}
          className={`shrink-0 rounded-xl px-4 py-2 text-sm font-semibold transition duration-200 ease-premium ${
            activeCategoryId === 'all'
              ? 'bg-accent-gradient text-white shadow-sm'
              : 'bg-slate-50 text-slate-500 hover:bg-slate-100 hover:text-slate-800'
          }`}
        >
          {t('pos.allItems')}
        </button>
        {menu?.categories?.map((category) => (
          <button
            key={category.id}
            type="button"
            onClick={() => onCategoryChange(category.id)}
            className={`shrink-0 rounded-xl px-4 py-2 text-sm font-semibold transition duration-200 ease-premium ${
              activeCategoryId === category.id
                ? 'bg-accent-gradient text-white shadow-sm'
                : 'bg-slate-50 text-slate-500 hover:bg-slate-100 hover:text-slate-800'
            }`}
          >
            {itemName(category, language)}
          </button>
        ))}
      </div>

      <div className="scrollbar-slim flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="surface-card overflow-hidden">
                <div className="skeleton h-28 rounded-none" />
                <div className="space-y-2 p-3">
                  <div className="skeleton h-4 w-3/4" />
                  <div className="skeleton h-4 w-1/3" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
            {displayItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onTapItem(item)}
                disabled={!item.isAvailable || order?.status !== 'draft'}
                className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200/70 bg-white text-start shadow-card transition duration-200 ease-premium hover:-translate-y-0.5 hover:border-accent-300/60 hover:shadow-card-hover disabled:pointer-events-none disabled:opacity-40"
              >
                <div className="flex h-28 items-center justify-center bg-gradient-to-br from-accent-500/10 to-accent-600/10">
                  <span className="text-3xl font-bold text-accent-600/40 transition group-hover:scale-110">
                    {displayInitial(itemName(item, language))}
                  </span>
                </div>
                <div className="flex flex-1 flex-col justify-between p-3">
                  <span className="font-semibold text-slate-900">{itemName(item, language)}</span>
                  <span className="mt-2 font-bold text-accent-600">
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
