import { useState } from 'react';
import { BilingualField } from './BilingualField.jsx';
import { isMissingTranslation } from '../../utils/menuTranslations.js';
import { menuLabel } from '../../utils/menuLabel.js';

export function ItemEditorModal({ t, item, categoryId, busy, onCancel, onSave }) {
  const isNew = !item?.id;
  const [form, setForm] = useState({
    nameEn: item?.nameEn ?? '',
    nameAr: item?.nameAr ?? '',
    price: item?.price != null ? String(item.price) : '',
    descriptionEn: item?.descriptionEn ?? '',
    descriptionAr: item?.descriptionAr ?? '',
  });

  function update(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleSubmit(e) {
    e.preventDefault();
    onSave({
      categoryId,
      nameEn: form.nameEn.trim(),
      nameAr: form.nameAr.trim(),
      price: Number(form.price),
      descriptionEn: form.descriptionEn.trim() || undefined,
      descriptionAr: form.descriptionAr.trim() || undefined,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-2xl rounded-xl bg-white p-6 shadow-xl"
      >
        <h3 className="text-lg font-semibold text-slate-900">
          {isNew ? t('menu.addItem') : t('menu.editItem')}
        </h3>
        <div className="mt-4 space-y-4">
          <BilingualField
            labelEn={t('menu.nameEn')}
            labelAr={t('menu.nameAr')}
            nameEn={form.nameEn}
            nameAr={form.nameAr}
            missingLabel={t('menu.missingTranslation')}
            onNameEnChange={(v) => update('nameEn', v)}
            onNameArChange={(v) => update('nameAr', v)}
            requiredEn
          />
          <label className="block text-sm">
            <span className="mb-1 font-medium text-slate-700">{t('menu.price')}</span>
            <input
              type="number"
              min="0"
              step="0.01"
              required
              className="w-full rounded-lg border border-slate-200 px-3 py-2"
              value={form.price}
              onChange={(e) => update('price', e.target.value)}
            />
          </label>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 font-medium text-slate-700">{t('menu.descriptionEn')}</span>
              <textarea
                className="w-full rounded-lg border border-slate-200 px-3 py-2"
                rows={2}
                value={form.descriptionEn}
                onChange={(e) => update('descriptionEn', e.target.value)}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 flex items-center gap-2 font-medium text-slate-700">
                {t('menu.descriptionAr')}
                {isMissingTranslation(form.descriptionAr) && form.descriptionEn ? (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                    {t('menu.missingTranslation')}
                  </span>
                ) : null}
              </span>
              <textarea
                dir="rtl"
                className="w-full rounded-lg border border-slate-200 px-3 py-2"
                rows={2}
                value={form.descriptionAr}
                onChange={(e) => update('descriptionAr', e.target.value)}
              />
            </label>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" className="rounded-lg border px-4 py-2 text-sm" onClick={onCancel}>
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-primary-gradient px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {t('common.save')}
          </button>
        </div>
      </form>
    </div>
  );
}

export function CategorySection({
  t,
  language,
  category,
  canEdit,
  busy,
  dragIndex,
  onDragStart,
  onDragOver,
  onDrop,
  onToggleAvailability,
  onEditItem,
  onAddItem,
}) {
  return (
    <section
      className="rounded-xl border border-slate-200 bg-white p-4"
      draggable={canEdit}
      onDragStart={() => onDragStart(dragIndex)}
      onDragOver={(e) => {
        e.preventDefault();
        onDragOver(dragIndex);
      }}
      onDrop={(e) => {
        e.preventDefault();
        onDrop(dragIndex);
      }}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {canEdit ? (
              <span className="cursor-grab text-secondary" title={t('menu.dragHint')} aria-hidden>
                ⠿
              </span>
            ) : null}
            <h3 className="text-lg font-semibold text-slate-900">{menuLabel(category, language)}</h3>
            {isMissingTranslation(category.nameAr) ? (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                {t('menu.missingTranslation')}
              </span>
            ) : null}
          </div>
          <p className="text-sm text-secondary">{category.nameEn}</p>
        </div>
        {canEdit ? (
          <button
            type="button"
            disabled={busy}
            className="shrink-0 rounded-lg border px-3 py-1.5 text-sm"
            onClick={() => onAddItem(category.id)}
          >
            {t('menu.addItem')}
          </button>
        ) : null}
      </div>

      <ul className="space-y-2">
        {category.items?.map((item) => (
          <li
            key={item.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2"
          >
            <div className="min-w-0">
              <p className="font-medium text-slate-900">
                {menuLabel(item, language)} — {item.price.toFixed(2)}
              </p>
              <p className="text-xs text-secondary">{item.nameEn}</p>
              {isMissingTranslation(item.nameAr) ? (
                <span className="mt-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                  {t('menu.missingTranslation')}
                </span>
              ) : null}
              {!item.isAvailable ? (
                <span className="ms-2 inline-block rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800">
                  86
                </span>
              ) : null}
            </div>
            {canEdit ? (
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={busy}
                  className="text-sm text-primary-to hover:underline"
                  onClick={() => onEditItem(item)}
                >
                  {t('menu.editItem')}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  className="text-sm text-amber-700 hover:underline"
                  onClick={() => onToggleAvailability(item)}
                >
                  {item.isAvailable ? t('menu.mark86') : t('menu.markAvailable')}
                </button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
