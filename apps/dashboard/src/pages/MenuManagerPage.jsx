import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../hooks/useAuth.js';
import { useMenuManager } from '../hooks/useMenuManager.js';
import { BilingualField } from '../components/menu/BilingualField.jsx';
import { CategorySection, ItemEditorModal } from '../components/menu/MenuEditor.jsx';
import { PublishConfirmModal } from '../components/menu/PublishConfirmModal.jsx';
import { MenuPreviewModal } from '../components/menu/MenuPreviewModal.jsx';
import { AutoTranslateModal } from '../components/menu/AutoTranslateModal.jsx';
import { menuLabel } from '../utils/menuLabel.js';
import { isMissingTranslation } from '../utils/menuTranslations.js';

export function MenuManagerPage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const canEdit = user?.role === 'hub_manager';
  const manager = useMenuManager({ canEdit });
  const fileInputRef = useRef(null);
  const dragFrom = useRef(null);
  const [localError, setLocalError] = useState('');

  const [newTemplate, setNewTemplate] = useState({ nameEn: '', nameAr: '', venueIds: [] });
  const [templateForm, setTemplateForm] = useState(null);
  const [newCategory, setNewCategory] = useState({ nameEn: '', nameAr: '' });
  const [addingItemCategoryId, setAddingItemCategoryId] = useState(null);

  useEffect(() => {
    if (!manager.detail) {
      setTemplateForm(null);
      return;
    }
    setTemplateForm({
      nameEn: manager.detail.nameEn ?? '',
      nameAr: manager.detail.nameAr ?? '',
      venueIds: manager.detail.venueIds ?? [],
    });
  }, [manager.detail]);

  function handleDragStart(index) {
    dragFrom.current = index;
  }

  function handleDrop(index) {
    if (dragFrom.current == null || dragFrom.current === index || !manager.detail?.categories) {
      dragFrom.current = null;
      return;
    }
    const categories = [...manager.detail.categories];
    const [moved] = categories.splice(dragFrom.current, 1);
    categories.splice(index, 0, moved);
    dragFrom.current = null;
    manager.reorderCategories(categories.map((c) => c.id));
  }

  async function handleImportFile(file) {
    const csv = await file.text();
    await manager.importCsv(csv);
  }

  async function handleSaveItem(payload) {
    if (manager.editingItem?.id) {
      await manager.updateItem(manager.editingItem.id, payload);
    } else {
      await manager.addItem(payload.categoryId, payload);
      setAddingItemCategoryId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">{t('menu.title')}</h2>
          <p className="mt-1 text-sm text-secondary">{t('menu.readOnlyPosNote')}</p>
        </div>
        {manager.detail && manager.missingCount > 0 ? (
          <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-medium text-amber-900">
            {t('menu.missingTranslationsCount', { count: manager.missingCount })}
          </span>
        ) : null}
      </div>

      {!canEdit ? (
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-secondary">
          {t('menu.hubManagerOnly')}
        </div>
      ) : null}

      {manager.error || localError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700">
          {manager.error || localError}
        </div>
      ) : null}

      {canEdit ? (
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="mb-3 font-medium">{t('menu.createTemplate')}</h3>
          <BilingualField
            labelEn={t('menu.nameEn')}
            labelAr={t('menu.nameAr')}
            nameEn={newTemplate.nameEn}
            nameAr={newTemplate.nameAr}
            missingLabel={t('menu.missingTranslation')}
            onNameEnChange={(v) => setNewTemplate({ ...newTemplate, nameEn: v })}
            onNameArChange={(v) => setNewTemplate({ ...newTemplate, nameAr: v })}
          />
          <div className="mt-3 flex flex-wrap gap-3">
            <select
              className="min-w-[12rem] rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={newTemplate.venueIds[0] ?? ''}
              onChange={(e) =>
                setNewTemplate({
                  ...newTemplate,
                  venueIds: e.target.value ? [e.target.value] : [],
                })
              }
            >
              <option value="">{t('menu.selectVenue')}</option>
              {manager.venues.map((v) => (
                <option key={v.id} value={v.id}>
                  {menuLabel(v, i18n.language)}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={manager.busy || !newTemplate.nameEn.trim()}
              className="rounded-lg bg-primary-gradient px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              onClick={() =>
                manager.createTemplate(newTemplate).then(() => {
                  setNewTemplate({ nameEn: '', nameAr: '', venueIds: [] });
                })
              }
            >
              {t('common.save')}
            </button>
          </div>
        </section>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
        <aside className="rounded-xl border border-slate-200 bg-white p-3">
          <h3 className="mb-2 font-medium">{t('menu.templates')}</h3>
          <ul className="space-y-1">
            {manager.templates.map((tmpl) => (
              <li key={tmpl.id}>
                <button
                  type="button"
                  onClick={() => {
                    manager.setSelectedId(tmpl.id);
                    setTemplateForm(null);
                  }}
                  className={`w-full rounded-lg px-3 py-2 text-start text-sm ${
                    manager.selectedId === tmpl.id
                      ? 'bg-slate-100 font-semibold'
                      : 'hover:bg-slate-50'
                  }`}
                >
                  {menuLabel(tmpl, i18n.language)}
                  <span className="ms-2 text-xs text-secondary">
                    ({tmpl.status === 'published' ? t('menu.statusPublished') : t('menu.statusDraft')})
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        {manager.detail && templateForm ? (
          <div className="space-y-4">
            {canEdit ? (
              <section className="rounded-xl border border-slate-200 bg-white p-4">
                <h3 className="mb-3 font-medium">{t('menu.templateSettings')}</h3>
                <BilingualField
                  labelEn={t('menu.nameEn')}
                  labelAr={t('menu.nameAr')}
                  nameEn={templateForm.nameEn}
                  nameAr={templateForm.nameAr}
                  missingLabel={t('menu.missingTranslation')}
                  onNameEnChange={(v) => setTemplateForm({ ...templateForm, nameEn: v })}
                  onNameArChange={(v) => setTemplateForm({ ...templateForm, nameAr: v })}
                />
                <div className="mt-3 flex flex-wrap gap-3">
                  <select
                    className="min-w-[12rem] rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    value={templateForm.venueIds[0] ?? ''}
                    onChange={(e) =>
                      setTemplateForm({
                        ...templateForm,
                        venueIds: e.target.value ? [e.target.value] : [],
                      })
                    }
                  >
                    <option value="">{t('menu.selectVenue')}</option>
                    {manager.venues.map((v) => (
                      <option key={v.id} value={v.id}>
                        {menuLabel(v, i18n.language)}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={manager.busy}
                    className="rounded-lg border px-4 py-2 text-sm"
                    onClick={() => manager.updateTemplate(templateForm)}
                  >
                    {t('menu.saveTemplate')}
                  </button>
                </div>
              </section>
            ) : null}

            <div className="flex flex-wrap gap-2">
              {canEdit ? (
                <>
                  <button
                    type="button"
                    disabled={manager.busy}
                    className="rounded-lg bg-primary-gradient px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                    onClick={() => manager.setShowPublishConfirm(true)}
                  >
                    {t('menu.publish')}
                  </button>
                  <button
                    type="button"
                    disabled={manager.busy}
                    className="rounded-lg border px-4 py-2 text-sm"
                    onClick={() => manager.loadSuggestions()}
                  >
                    {t('menu.autoTranslate')}
                  </button>
                  <button
                    type="button"
                    disabled={manager.busy}
                    className="rounded-lg border px-4 py-2 text-sm"
                    onClick={() => manager.exportCsv().catch((e) => setLocalError(e.message))}
                  >
                    {t('menu.exportCsv')}
                  </button>
                  <button
                    type="button"
                    disabled={manager.busy}
                    className="rounded-lg border px-4 py-2 text-sm"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {t('menu.importCsv')}
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,text/csv"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleImportFile(file).catch(() => {});
                      e.target.value = '';
                    }}
                  />
                </>
              ) : null}
              <button
                type="button"
                className="rounded-lg border px-4 py-2 text-sm"
                onClick={() => manager.setShowPreview(true)}
              >
                {t('menu.preview')}
              </button>
            </div>

            {canEdit ? (
              <section className="rounded-xl border border-slate-200 bg-white p-4">
                <h3 className="mb-3 font-medium">{t('menu.addCategory')}</h3>
                <BilingualField
                  labelEn={t('menu.nameEn')}
                  labelAr={t('menu.nameAr')}
                  nameEn={newCategory.nameEn}
                  nameAr={newCategory.nameAr}
                  missingLabel={t('menu.missingTranslation')}
                  onNameEnChange={(v) => setNewCategory({ ...newCategory, nameEn: v })}
                  onNameArChange={(v) => setNewCategory({ ...newCategory, nameAr: v })}
                />
                <button
                  type="button"
                  disabled={manager.busy || !newCategory.nameEn.trim()}
                  className="mt-3 rounded-lg border px-4 py-2 text-sm disabled:opacity-50"
                  onClick={() =>
                    manager.addCategory(newCategory).then(() => setNewCategory({ nameEn: '', nameAr: '' }))
                  }
                >
                  {t('menu.addCategory')}
                </button>
              </section>
            ) : null}

            {manager.detail.categories?.length ? (
              manager.detail.categories.map((category, index) => (
                <CategorySection
                  key={category.id}
                  t={t}
                  language={i18n.language}
                  category={category}
                  canEdit={canEdit}
                  busy={manager.busy}
                  dragIndex={index}
                  onDragStart={handleDragStart}
                  onDragOver={() => {}}
                  onDrop={handleDrop}
                  onToggleAvailability={manager.toggleAvailability}
                  onEditItem={(item) => manager.setEditingItem({ ...item, categoryId: category.id })}
                  onAddItem={setAddingItemCategoryId}
                />
              ))
            ) : (
              <div className="rounded-xl border border-dashed border-slate-200 bg-white p-8 text-center text-secondary">
                {t('menu.noCategories')}
              </div>
            )}
          </div>
        ) : null}
      </div>

      {manager.showPublishConfirm ? (
        <PublishConfirmModal
          t={t}
          missingCount={manager.missingCount}
          busy={manager.busy}
          onCancel={() => manager.setShowPublishConfirm(false)}
          onConfirm={() => manager.publish()}
        />
      ) : null}

      {manager.showPreview ? (
        <MenuPreviewModal
          t={t}
          detail={manager.detail}
          language={i18n.language}
          onClose={() => manager.setShowPreview(false)}
        />
      ) : null}

      {manager.showAutoTranslate ? (
        <AutoTranslateModal
          t={t}
          suggestions={manager.suggestions}
          busy={manager.busy}
          onChange={(index, value) => {
            manager.setSuggestions(
              manager.suggestions.map((row, i) => (i === index ? { ...row, nameAr: value } : row)),
            );
          }}
          onCancel={() => {
            manager.setShowAutoTranslate(false);
            manager.setSuggestions([]);
          }}
          onApply={() => manager.applySuggestions()}
        />
      ) : null}

      {(manager.editingItem || addingItemCategoryId) && canEdit ? (
        <ItemEditorModal
          t={t}
          item={manager.editingItem}
          categoryId={addingItemCategoryId ?? manager.editingItem?.categoryId}
          busy={manager.busy}
          onCancel={() => {
            manager.setEditingItem(null);
            setAddingItemCategoryId(null);
          }}
          onSave={handleSaveItem}
        />
      ) : null}
    </div>
  );
}
