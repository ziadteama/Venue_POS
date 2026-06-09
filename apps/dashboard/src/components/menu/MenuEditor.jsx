import { useState } from 'react';
import { BilingualField } from './BilingualField.jsx';
import { isMissingTranslation } from '../../utils/menuTranslations.js';
import { menuLabel } from '../../utils/menuLabel.js';
import { Modal } from '../ui/Modal.jsx';
import { Button } from '../ui/Button.jsx';
import { Field, Input, Textarea } from '../ui/Field.jsx';
import { Badge } from '../ui/Badge.jsx';

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
    <Modal
      onClose={busy ? undefined : onCancel}
      size="xl"
      title={isNew ? t('menu.addItem') : t('menu.editItem')}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="item-editor-form" variant="primary" loading={busy}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <form id="item-editor-form" onSubmit={handleSubmit} className="space-y-4">
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
        <Field label={t('menu.price')}>
          <Input
            type="number"
            min="0"
            step="0.01"
            required
            value={form.price}
            onChange={(e) => update('price', e.target.value)}
          />
        </Field>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label={t('menu.descriptionEn')}>
            <Textarea
              rows={2}
              value={form.descriptionEn}
              onChange={(e) => update('descriptionEn', e.target.value)}
            />
          </Field>
          <label className="block text-sm">
            <span className="mb-1.5 flex items-center gap-2 font-medium text-slate-700">
              {t('menu.descriptionAr')}
              {isMissingTranslation(form.descriptionAr) && form.descriptionEn ? (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                  {t('menu.missingTranslation')}
                </span>
              ) : null}
            </span>
            <Textarea
              dir="rtl"
              rows={2}
              value={form.descriptionAr}
              onChange={(e) => update('descriptionAr', e.target.value)}
            />
          </label>
        </div>
      </form>
    </Modal>
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
      className="surface-card overflow-hidden"
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
      <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {canEdit ? (
              <span className="cursor-grab text-slate-400" title={t('menu.dragHint')} aria-hidden>
                ⠿
              </span>
            ) : null}
            <h3 className="text-base font-semibold text-slate-900">{menuLabel(category, language)}</h3>
            {isMissingTranslation(category.nameAr) ? (
              <Badge tone="amber">{t('menu.missingTranslation')}</Badge>
            ) : null}
          </div>
          <p className="text-sm text-slate-500">{category.nameEn}</p>
        </div>
        {canEdit ? (
          <Button variant="secondary" size="sm" disabled={busy} onClick={() => onAddItem(category.id)}>
            {t('menu.addItem')}
          </Button>
        ) : null}
      </div>

      <ul className="divide-y divide-slate-100">
        {category.items?.map((item) => (
          <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
            <div className="min-w-0">
              <p className="font-medium text-slate-900">
                {menuLabel(item, language)} —{' '}
                <span className="tabular-nums text-accent-700">{item.price.toFixed(2)}</span>
              </p>
              <p className="text-xs text-slate-500">{item.nameEn}</p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {isMissingTranslation(item.nameAr) ? (
                  <Badge tone="amber">{t('menu.missingTranslation')}</Badge>
                ) : null}
                {!item.isAvailable ? <Badge tone="red">86</Badge> : null}
              </div>
            </div>
            {canEdit ? (
              <div className="flex gap-2">
                <Button variant="subtle" size="sm" disabled={busy} onClick={() => onEditItem(item)}>
                  {t('menu.editItem')}
                </Button>
                <Button
                  variant="subtle"
                  size="sm"
                  disabled={busy}
                  className="text-amber-700 hover:bg-amber-50"
                  onClick={() => onToggleAvailability(item)}
                >
                  {item.isAvailable ? t('menu.mark86') : t('menu.markAvailable')}
                </Button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
