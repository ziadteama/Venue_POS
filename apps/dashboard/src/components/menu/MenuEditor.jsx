import { useState } from 'react';
import { BilingualField } from './BilingualField.jsx';
import { menuLabel } from '../../utils/menuLabel.js';
import { Drawer } from '../ui/Drawer.jsx';
import { Button } from '../ui/Button.jsx';
import { Field, Input, Textarea } from '../ui/Field.jsx';
import { Badge } from '../ui/Badge.jsx';
import { SectionCard } from '../ui/Card.jsx';

function emptyDraftOption() {
  return { key: crypto.randomUUID(), nameEn: '', nameAr: '', priceDelta: '0' };
}

function emptyDraftGroup() {
  return {
    key: crypto.randomUUID(),
    nameEn: '',
    nameAr: '',
    minSelection: '0',
    maxSelection: '1',
    options: [emptyDraftOption()],
  };
}

function InlineModifierGroupCard({ t, group, onChange, onRemove }) {
  function update(field, value) {
    onChange({ ...group, [field]: value });
  }

  function updateOption(optionKey, field, value) {
    onChange({
      ...group,
      options: group.options.map((opt) =>
        opt.key === optionKey ? { ...opt, [field]: value } : opt,
      ),
    });
  }

  function addOption() {
    onChange({ ...group, options: [...group.options, emptyDraftOption()] });
  }

  function removeOption(optionKey) {
    if (group.options.length <= 1) return;
    onChange({ ...group, options: group.options.filter((opt) => opt.key !== optionKey) });
  }

  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/50 p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold text-slate-900">{t('menu.modifierSet')}</p>
        <Button variant="subtle" size="sm" className="text-red-700" onClick={onRemove}>
          {t('menu.removeModifierSet')}
        </Button>
      </div>
      <BilingualField
        labelEn={t('menu.nameEn')}
        labelAr={t('menu.nameAr')}
        nameEn={group.nameEn}
        nameAr={group.nameAr}
        onNameEnChange={(v) => update('nameEn', v)}
        onNameArChange={(v) => update('nameAr', v)}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('menu.minSelection')}>
          <Input
            type="number"
            min="0"
            value={group.minSelection}
            onChange={(e) => update('minSelection', e.target.value)}
          />
        </Field>
        <Field label={t('menu.maxSelection')}>
          <Input
            type="number"
            min="0"
            value={group.maxSelection}
            onChange={(e) => update('maxSelection', e.target.value)}
          />
        </Field>
      </div>
      <div>
        <p className="mb-2 text-sm font-medium text-slate-700">{t('menu.modifierOptions')}</p>
        <ul className="space-y-2">
          {group.options.map((opt) => (
            <li key={opt.key} className="flex flex-wrap items-end gap-2">
              <Input
                className="min-w-[10rem] flex-1"
                placeholder={t('menu.nameEn')}
                value={opt.nameEn}
                onChange={(e) => updateOption(opt.key, 'nameEn', e.target.value)}
              />
              <Input
                dir="rtl"
                className="min-w-[8rem] flex-1"
                placeholder={t('menu.nameAr')}
                value={opt.nameAr}
                onChange={(e) => updateOption(opt.key, 'nameAr', e.target.value)}
              />
              <Input
                type="number"
                step="0.01"
                className="w-28"
                placeholder={t('menu.priceDelta')}
                value={opt.priceDelta}
                onChange={(e) => updateOption(opt.key, 'priceDelta', e.target.value)}
              />
              {group.options.length > 1 ? (
                <Button variant="subtle" size="sm" onClick={() => removeOption(opt.key)}>
                  {t('common.delete')}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
        <Button variant="subtle" size="sm" className="mt-2" onClick={addOption}>
          {t('menu.addOption')}
        </Button>
      </div>
    </div>
  );
}

export function ItemEditorDrawer({
  t,
  item,
  categoryId,
  modifierGroups,
  busy,
  onCancel,
  onSave,
}) {
  const isNew = !item?.id;
  const attachedIds = new Set(
    (item?.modifierGroups ?? []).map((g) => g.id ?? g.modifierGroup?.id).filter(Boolean),
  );

  const [form, setForm] = useState({
    nameEn: item?.nameEn ?? '',
    nameAr: item?.nameAr ?? '',
    price: item?.price != null ? String(item.price) : '',
    descriptionEn: item?.descriptionEn ?? '',
    descriptionAr: item?.descriptionAr ?? '',
    imageUrl: item?.imageUrl ?? '',
    isAvailable: item?.isAvailable ?? true,
    modifierGroupIds: [...attachedIds],
  });
  const [draftGroups, setDraftGroups] = useState([]);

  function update(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function toggleModifierGroup(groupId) {
    setForm((prev) => {
      const ids = new Set(prev.modifierGroupIds);
      if (ids.has(groupId)) ids.delete(groupId);
      else ids.add(groupId);
      return { ...prev, modifierGroupIds: [...ids] };
    });
  }

  function updateDraftGroup(key, next) {
    setDraftGroups((prev) => prev.map((g) => (g.key === key ? next : g)));
  }

  function removeDraftGroup(key) {
    setDraftGroups((prev) => prev.filter((g) => g.key !== key));
  }

  function handleSubmit(e) {
    e.preventDefault();
    const newModifierGroups = draftGroups
      .filter((g) => g.nameEn.trim())
      .map((g) => ({
        nameEn: g.nameEn.trim(),
        nameAr: g.nameAr.trim(),
        minSelection: Number(g.minSelection) || 0,
        maxSelection: Number(g.maxSelection) || 1,
        options: g.options
          .filter((opt) => opt.nameEn.trim())
          .map((opt) => ({
            nameEn: opt.nameEn.trim(),
            nameAr: opt.nameAr.trim(),
            priceDelta: Number(opt.priceDelta) || 0,
          })),
      }))
      .filter((g) => g.options.length > 0);

    onSave({
      categoryId,
      nameEn: form.nameEn.trim(),
      nameAr: form.nameAr.trim(),
      price: Number(form.price),
      descriptionEn: form.descriptionEn.trim() || undefined,
      descriptionAr: form.descriptionAr.trim() || undefined,
      imageUrl: form.imageUrl.trim() || undefined,
      isAvailable: form.isAvailable,
      modifierGroupIds: form.modifierGroupIds,
      newModifierGroups,
    });
  }

  return (
    <Drawer
      open
      onClose={busy ? undefined : onCancel}
      size="lg"
      title={isNew ? t('menu.addItem') : t('menu.editItem')}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="item-editor-form" variant="primary" loading={busy}>
            {t('menu.saveAndPublish')}
          </Button>
        </>
      }
    >
      <form id="item-editor-form" onSubmit={handleSubmit} className="space-y-5">
        <BilingualField
          labelEn={t('menu.nameEn')}
          labelAr={t('menu.nameAr')}
          nameEn={form.nameEn}
          nameAr={form.nameAr}
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
          <Field label={t('menu.descriptionAr')}>
            <Textarea
              dir="rtl"
              rows={2}
              value={form.descriptionAr}
              onChange={(e) => update('descriptionAr', e.target.value)}
            />
          </Field>
        </div>
        <Field label={t('menu.imageUrl')}>
          <Input value={form.imageUrl} onChange={(e) => update('imageUrl', e.target.value)} />
        </Field>
        <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
          <input
            type="checkbox"
            checked={form.isAvailable}
            onChange={(e) => update('isAvailable', e.target.checked)}
          />
          {t('menu.availableOnPos')}
        </label>

        <div className="space-y-3">
          <div>
            <p className="text-sm font-semibold text-slate-900">{t('menu.itemModifiers')}</p>
            <p className="mt-1 text-sm text-slate-500">{t('menu.itemModifiersInlineHint')}</p>
          </div>

          {draftGroups.map((group) => (
            <InlineModifierGroupCard
              key={group.key}
              t={t}
              group={group}
              onChange={(next) => updateDraftGroup(group.key, next)}
              onRemove={() => removeDraftGroup(group.key)}
            />
          ))}

          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setDraftGroups((prev) => [...prev, emptyDraftGroup()])}
          >
            {t('menu.addModifierSet')}
          </Button>

          {modifierGroups.length > 0 ? (
            <details className="rounded-xl border border-slate-200 px-4 py-3">
              <summary className="cursor-pointer text-sm font-medium text-slate-700">
                {t('menu.attachExistingModifiers')}
              </summary>
              <ul className="mt-3 space-y-2">
                {modifierGroups.map((group) => (
                  <li key={group.id}>
                    <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50">
                      <input
                        type="checkbox"
                        checked={form.modifierGroupIds.includes(group.id)}
                        onChange={() => toggleModifierGroup(group.id)}
                      />
                      <span className="font-medium">{group.nameEn}</span>
                      <span className="text-xs text-slate-500">
                        {t('menu.modifierRule', {
                          min: group.minSelection,
                          max: group.maxSelection,
                        })}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      </form>
    </Drawer>
  );
}

export function ModifierGroupsSection({ t, language, groups, busy, onAddGroup, onDeleteGroup, onAddOption }) {
  const [form, setForm] = useState({
    nameEn: '',
    nameAr: '',
    minSelection: '0',
    maxSelection: '1',
    optionNameEn: '',
    optionNameAr: '',
    optionPrice: '0',
  });
  const [addingOptionFor, setAddingOptionFor] = useState(null);
  const [optionForm, setOptionForm] = useState({ nameEn: '', nameAr: '', priceDelta: '0' });

  function handleAddGroup() {
    if (!form.nameEn.trim()) return;
    onAddGroup({
      nameEn: form.nameEn.trim(),
      nameAr: form.nameAr.trim(),
      minSelection: Number(form.minSelection),
      maxSelection: Number(form.maxSelection),
      options: form.optionNameEn.trim()
        ? [
            {
              nameEn: form.optionNameEn.trim(),
              nameAr: form.optionNameAr.trim(),
              priceDelta: Number(form.optionPrice) || 0,
            },
          ]
        : undefined,
    }).then(() => {
      setForm({
        nameEn: '',
        nameAr: '',
        minSelection: '0',
        maxSelection: '1',
        optionNameEn: '',
        optionNameAr: '',
        optionPrice: '0',
      });
    });
  }

  function handleAddOption(groupId) {
    if (!optionForm.nameEn.trim()) return;
    onAddOption(groupId, {
      nameEn: optionForm.nameEn.trim(),
      nameAr: optionForm.nameAr.trim(),
      priceDelta: Number(optionForm.priceDelta) || 0,
    }).then(() => {
      setAddingOptionFor(null);
      setOptionForm({ nameEn: '', nameAr: '', priceDelta: '0' });
    });
  }

  return (
    <SectionCard title={t('menu.modifierGroups')}>
      <p className="mb-4 text-sm text-slate-500">{t('menu.modifierGroupsLibraryHint')}</p>

      {groups.length === 0 ? (
        <p className="mb-4 text-sm text-slate-500">{t('menu.noModifierGroups')}</p>
      ) : (
        <ul className="mb-6 divide-y divide-slate-100 rounded-xl border border-slate-200">
          {groups.map((group) => (
            <li key={group.id} className="px-4 py-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-slate-900">{menuLabel(group, language)}</p>
                  <p className="text-xs text-slate-500">
                    {t('menu.modifierRule', { min: group.minSelection, max: group.maxSelection })}
                  </p>
                </div>
                <Button
                  variant="subtle"
                  size="sm"
                  className="text-red-700"
                  disabled={busy}
                  onClick={() => onDeleteGroup(group.id)}
                >
                  {t('common.delete')}
                </Button>
              </div>
              <ul className="mt-2 space-y-1 text-sm text-slate-600">
                {group.options?.map((opt) => (
                  <li key={opt.id}>
                    {menuLabel(opt, language)}
                    {Number(opt.priceDelta) !== 0 ? (
                      <span className="ms-1 text-accent-700">
                        (+{Number(opt.priceDelta).toFixed(2)})
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
              {addingOptionFor === group.id ? (
                <div className="mt-3 flex flex-wrap items-end gap-2">
                  <Input
                    placeholder={t('menu.nameEn')}
                    value={optionForm.nameEn}
                    onChange={(e) => setOptionForm({ ...optionForm, nameEn: e.target.value })}
                  />
                  <Input
                    type="number"
                    step="0.01"
                    className="w-24"
                    placeholder={t('menu.priceDelta')}
                    value={optionForm.priceDelta}
                    onChange={(e) => setOptionForm({ ...optionForm, priceDelta: e.target.value })}
                  />
                  <Button variant="secondary" size="sm" disabled={busy} onClick={() => handleAddOption(group.id)}>
                    {t('menu.addOption')}
                  </Button>
                  <Button variant="subtle" size="sm" onClick={() => setAddingOptionFor(null)}>
                    {t('common.cancel')}
                  </Button>
                </div>
              ) : (
                <Button
                  variant="subtle"
                  size="sm"
                  className="mt-2"
                  disabled={busy}
                  onClick={() => setAddingOptionFor(group.id)}
                >
                  {t('menu.addOption')}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        <Field label={t('menu.nameEn')}>
          <Input value={form.nameEn} onChange={(e) => setForm({ ...form, nameEn: e.target.value })} />
        </Field>
        <Field label={t('menu.nameAr')}>
          <Input dir="rtl" value={form.nameAr} onChange={(e) => setForm({ ...form, nameAr: e.target.value })} />
        </Field>
        <Field label={t('menu.minSelection')}>
          <Input
            type="number"
            min="0"
            value={form.minSelection}
            onChange={(e) => setForm({ ...form, minSelection: e.target.value })}
          />
        </Field>
        <Field label={t('menu.maxSelection')}>
          <Input
            type="number"
            min="0"
            value={form.maxSelection}
            onChange={(e) => setForm({ ...form, maxSelection: e.target.value })}
          />
        </Field>
        <Field label={t('menu.firstOptionEn')}>
          <Input
            value={form.optionNameEn}
            onChange={(e) => setForm({ ...form, optionNameEn: e.target.value })}
          />
        </Field>
        <Field label={t('menu.firstOptionPrice')}>
          <Input
            type="number"
            step="0.01"
            value={form.optionPrice}
            onChange={(e) => setForm({ ...form, optionPrice: e.target.value })}
          />
        </Field>
      </div>
      <Button variant="secondary" size="sm" className="mt-3" disabled={busy || !form.nameEn.trim()} onClick={handleAddGroup}>
        {t('menu.addModifierGroup')}
      </Button>
    </SectionCard>
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
  onDeleteCategory,
  onDeleteItem,
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
          </div>
        </div>
        {canEdit ? (
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" disabled={busy} onClick={() => onAddItem(category.id)}>
              {t('menu.addItem')}
            </Button>
            <Button
              variant="subtle"
              size="sm"
              className="text-red-700"
              disabled={busy}
              onClick={onDeleteCategory}
            >
              {t('common.delete')}
            </Button>
          </div>
        ) : null}
      </div>

      <ul className="divide-y divide-slate-100">
        {category.items?.length ? (
          category.items.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
              <div className="min-w-0">
                <p className="font-medium text-slate-900">
                  {menuLabel(item, language)} —{' '}
                  <span className="tabular-nums text-accent-700">{Number(item.price).toFixed(2)}</span>
                </p>
                {item.modifierGroups?.length > 0 ? (
                  <p className="text-xs text-slate-500">
                    {item.modifierGroups.map((g) => g.nameEn).join(', ')}
                  </p>
                ) : null}
                {!item.isAvailable ? <Badge tone="red">86</Badge> : null}
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
                  <Button
                    variant="subtle"
                    size="sm"
                    className="text-red-700"
                    disabled={busy}
                    onClick={() => onDeleteItem(item)}
                  >
                    {t('common.delete')}
                  </Button>
                </div>
              ) : null}
            </li>
          ))
        ) : (
          <li className="px-5 py-4 text-sm text-slate-500">{t('menu.noItemsInCategory')}</li>
        )}
      </ul>
    </section>
  );
}
