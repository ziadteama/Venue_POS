import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiFetch } from '../api/client.js';

function label(item, lang) {
  return lang === 'ar' ? item.nameAr : item.nameEn;
}

export function MenuManagerPage() {
  const { t, i18n } = useTranslation();
  const [templates, setTemplates] = useState([]);
  const [venues, setVenues] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const [newTemplate, setNewTemplate] = useState({ nameEn: '', nameAr: '', venueIds: [] });
  const [newCategory, setNewCategory] = useState({ nameEn: '', nameAr: '' });
  const [newItem, setNewItem] = useState({
    categoryId: '',
    nameEn: '',
    nameAr: '',
    price: '',
  });

  const load = useCallback(async () => {
    setError('');
    const [list, venueList] = await Promise.all([
      apiFetch('/api/v1/menu-templates'),
      apiFetch('/api/v1/venues'),
    ]);
    setTemplates(list);
    setVenues(venueList);
    if (!selectedId && list[0]) setSelectedId(list[0].id);
  }, [selectedId]);

  const loadDetail = useCallback(async (id) => {
    if (!id) return;
    setDetail(await apiFetch(`/api/v1/menu-templates/${id}`));
  }, []);

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [load]);

  useEffect(() => {
    if (selectedId) loadDetail(selectedId).catch((e) => setError(e.message));
  }, [selectedId, loadDetail]);

  async function run(action) {
    setBusy(true);
    setError('');
    try {
      await action();
      await load();
      if (selectedId) await loadDetail(selectedId);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">{t('menu.title')}</h2>
        <span className="text-sm text-secondary">{t('menu.readOnlyPosNote')}</span>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700">
          {error}
        </div>
      )}

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="mb-3 font-medium">{t('menu.createTemplate')}</h3>
        <div className="grid gap-3 md:grid-cols-4">
          <input
            className="rounded border px-3 py-2"
            placeholder={t('menu.nameEn')}
            value={newTemplate.nameEn}
            onChange={(e) => setNewTemplate({ ...newTemplate, nameEn: e.target.value })}
          />
          <input
            className="rounded border px-3 py-2"
            placeholder={t('menu.nameAr')}
            value={newTemplate.nameAr}
            onChange={(e) => setNewTemplate({ ...newTemplate, nameAr: e.target.value })}
          />
          <select
            className="rounded border px-3 py-2"
            value={newTemplate.venueIds[0] ?? ''}
            onChange={(e) =>
              setNewTemplate({ ...newTemplate, venueIds: e.target.value ? [e.target.value] : [] })
            }
          >
            <option value="">{t('menu.selectVenue')}</option>
            {venues.map((v) => (
              <option key={v.id} value={v.id}>
                {label(v, i18n.language)}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={busy}
            className="rounded-lg bg-primary-gradient px-4 py-2 text-white hover:opacity-90 disabled:opacity-50"
            onClick={() =>
              run(async () => {
                const created = await apiFetch('/api/v1/menu-templates', {
                  method: 'POST',
                  body: JSON.stringify(newTemplate),
                });
                setSelectedId(created.id);
                setNewTemplate({ nameEn: '', nameAr: '', venueIds: [] });
              })
            }
          >
            {t('common.save')}
          </button>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
        <aside className="rounded-xl border border-slate-200 bg-white p-3">
          <h3 className="mb-2 font-medium">{t('menu.templates')}</h3>
          <ul className="space-y-1">
            {templates.map((tmpl) => (
              <li key={tmpl.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(tmpl.id)}
                  className={`w-full rounded-lg px-3 py-2 text-start text-sm ${
                    selectedId === tmpl.id ? 'bg-slate-100 font-semibold' : 'hover:bg-slate-50'
                  }`}
                >
                  {label(tmpl, i18n.language)}
                  <span className="ms-2 text-xs text-secondary">({tmpl.status})</span>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        {detail && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy || detail.status === 'published'}
                className="rounded-lg bg-primary-gradient px-4 py-2 text-white hover:opacity-90 disabled:opacity-50"
                onClick={() =>
                  run(() =>
                    apiFetch(`/api/v1/menu-templates/${detail.id}/publish`, { method: 'POST' }),
                  )
                }
              >
                {t('menu.publish')}
              </button>
            </div>

            <section className="rounded-xl border border-slate-200 bg-white p-4">
              <h3 className="mb-3 font-medium">{t('menu.addCategory')}</h3>
              <div className="grid gap-3 md:grid-cols-3">
                <input
                  className="rounded border px-3 py-2"
                  placeholder={t('menu.nameEn')}
                  value={newCategory.nameEn}
                  onChange={(e) => setNewCategory({ ...newCategory, nameEn: e.target.value })}
                />
                <input
                  className="rounded border px-3 py-2"
                  placeholder={t('menu.nameAr')}
                  value={newCategory.nameAr}
                  onChange={(e) => setNewCategory({ ...newCategory, nameAr: e.target.value })}
                />
                <button
                  type="button"
                  disabled={busy}
                  className="rounded-lg border px-4 py-2 disabled:opacity-50"
                  onClick={() =>
                    run(async () => {
                      await apiFetch(`/api/v1/menu-templates/${detail.id}/categories`, {
                        method: 'POST',
                        body: JSON.stringify(newCategory),
                      });
                      setNewCategory({ nameEn: '', nameAr: '' });
                    })
                  }
                >
                  {t('menu.addCategory')}
                </button>
              </div>
            </section>

            {detail.categories?.map((category) => (
              <section key={category.id} className="rounded-xl border border-slate-200 bg-white p-4">
                <h3 className="mb-3 text-lg font-semibold">{label(category, i18n.language)}</h3>
                <ul className="mb-4 space-y-2">
                  {category.items?.map((item) => (
                    <li
                      key={item.id}
                      className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2"
                    >
                      <span>
                        {label(item, i18n.language)} — {item.price.toFixed(2)}
                      </span>
                      <button
                        type="button"
                        disabled={busy}
                        className="text-sm text-amber-700 hover:underline"
                        onClick={() =>
                          run(() =>
                            apiFetch(`/api/v1/menu-items/${item.id}`, {
                              method: 'PATCH',
                              body: JSON.stringify({ isAvailable: !item.isAvailable }),
                            }),
                          )
                        }
                      >
                        {item.isAvailable ? t('menu.mark86') : t('menu.markAvailable')}
                      </button>
                    </li>
                  ))}
                </ul>
                <div className="grid gap-2 md:grid-cols-4">
                  <input
                    className="rounded border px-3 py-2"
                    placeholder={t('menu.nameEn')}
                    value={newItem.categoryId === category.id ? newItem.nameEn : ''}
                    onChange={(e) =>
                      setNewItem({
                        categoryId: category.id,
                        nameEn: e.target.value,
                        nameAr: newItem.categoryId === category.id ? newItem.nameAr : '',
                        price: newItem.categoryId === category.id ? newItem.price : '',
                      })
                    }
                  />
                  <input
                    className="rounded border px-3 py-2"
                    placeholder={t('menu.nameAr')}
                    value={newItem.categoryId === category.id ? newItem.nameAr : ''}
                    onChange={(e) =>
                      setNewItem({ ...newItem, categoryId: category.id, nameAr: e.target.value })
                    }
                  />
                  <input
                    className="rounded border px-3 py-2"
                    placeholder={t('menu.price')}
                    type="number"
                    value={newItem.categoryId === category.id ? newItem.price : ''}
                    onChange={(e) =>
                      setNewItem({ ...newItem, categoryId: category.id, price: e.target.value })
                    }
                  />
                  <button
                    type="button"
                    disabled={busy || newItem.categoryId !== category.id}
                    className="rounded-lg border px-4 py-2 disabled:opacity-50"
                    onClick={() =>
                      run(async () => {
                        await apiFetch(`/api/v1/categories/${category.id}/items`, {
                          method: 'POST',
                          body: JSON.stringify({
                            nameEn: newItem.nameEn,
                            nameAr: newItem.nameAr,
                            price: Number(newItem.price),
                          }),
                        });
                        setNewItem({ categoryId: '', nameEn: '', nameAr: '', price: '' });
                      })
                    }
                  >
                    {t('menu.addItem')}
                  </button>
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
