import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../hooks/useAuth.js';
import { useMenuManager } from '../hooks/useMenuManager.js';
import { friendlyError } from '../utils/apiError.js';
import { BilingualField } from '../components/menu/BilingualField.jsx';
import { CategorySection, ItemEditorModal } from '../components/menu/MenuEditor.jsx';
import { PublishConfirmModal } from '../components/menu/PublishConfirmModal.jsx';
import { MenuPreviewModal } from '../components/menu/MenuPreviewModal.jsx';
import { AutoTranslateModal } from '../components/menu/AutoTranslateModal.jsx';
import { menuLabel } from '../utils/menuLabel.js';
import { PageHeader } from '../components/dashboard/PageHeader.jsx';
import { SectionCard } from '../components/ui/Card.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Field, Select } from '../components/ui/Field.jsx';
import { Drawer } from '../components/ui/Drawer.jsx';
import { StatusBadge } from '../components/ui/Badge.jsx';
import { EmptyState } from '../components/ui/EmptyState.jsx';
import {
  MenuIcon,
  PlusIcon,
  SparkIcon,
  DownloadIcon,
  AlertIcon,
} from '../components/dashboard/icons.jsx';

export function MenuManagerPage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const isHub = user?.role === 'hub_manager';
  const manager = useMenuManager({ canEdit: isHub, enabled: isHub });
  const fileInputRef = useRef(null);
  const dragFrom = useRef(null);
  const [localError, setLocalError] = useState('');

  const [newTemplate, setNewTemplate] = useState({ nameEn: '', nameAr: '', venueIds: [] });
  const [showNewTemplate, setShowNewTemplate] = useState(false);
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

  if (!isHub) {
    return (
      <div className="surface-card p-8 text-center text-sm text-slate-500">{t('menu.hubManagerOnly')}</div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('menu.title')}
        subtitle={t('menu.readOnlyPosNote')}
        actions={
          <Button variant="primary" onClick={() => setShowNewTemplate(true)}>
            <PlusIcon className="h-4 w-4" />
            {t('menu.createTemplate')}
          </Button>
        }
      />

      {manager.error || localError ? (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          <AlertIcon className="h-5 w-5 shrink-0" />
          {manager.error || localError}
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[16rem_1fr]">
        <aside className="surface-card h-max overflow-hidden lg:sticky lg:top-20">
          <div className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-900">
            {t('menu.templates')}
          </div>
          <ul className="scrollbar-slim max-h-[32rem] divide-y divide-slate-100 overflow-y-auto">
            {manager.templates.length === 0 ? (
              <li>
                <EmptyState icon={MenuIcon} title={t('menu.noCategories')} className="py-10" />
              </li>
            ) : (
              manager.templates.map((tmpl) => {
                const active = manager.selectedId === tmpl.id;
                return (
                  <li key={tmpl.id}>
                    <button
                      type="button"
                      onClick={() => {
                        manager.setSelectedId(tmpl.id);
                        setTemplateForm(null);
                      }}
                      className={`relative flex w-full items-center justify-between gap-2 px-4 py-3 text-start text-sm transition-colors ${
                        active ? 'bg-accent-50/70' : 'hover:bg-slate-50'
                      }`}
                    >
                      {active ? (
                        <span className="absolute inset-y-0 start-0 w-1 rounded-e bg-accent-gradient" />
                      ) : null}
                      <span className={active ? 'font-semibold text-slate-900' : 'text-slate-700'}>
                        {menuLabel(tmpl, i18n.language)}
                      </span>
                      <StatusBadge
                        status={tmpl.status === 'published' ? 'published' : 'draft'}
                        label={
                          tmpl.status === 'published' ? t('menu.statusPublished') : t('menu.statusDraft')
                        }
                        dot={false}
                      />
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </aside>

        {manager.detail && templateForm ? (
          <div className="min-w-0 space-y-5">
            {manager.missingCount > 0 ? (
              <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
                <AlertIcon className="h-5 w-5 shrink-0" />
                {t('menu.missingTranslationsCount', { count: manager.missingCount })}
              </div>
            ) : null}

            <SectionCard
              title={t('menu.templateSettings')}
              action={
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" onClick={() => manager.setShowPreview(true)}>
                    {t('menu.preview')}
                  </Button>
                  <Button variant="primary" disabled={manager.busy} onClick={() => manager.setShowPublishConfirm(true)}>
                    {t('menu.publish')}
                  </Button>
                </div>
              }
            >
              <BilingualField
                labelEn={t('menu.nameEn')}
                labelAr={t('menu.nameAr')}
                nameEn={templateForm.nameEn}
                nameAr={templateForm.nameAr}
                missingLabel={t('menu.missingTranslation')}
                onNameEnChange={(v) => setTemplateForm({ ...templateForm, nameEn: v })}
                onNameArChange={(v) => setTemplateForm({ ...templateForm, nameAr: v })}
              />
              <div className="mt-3 flex flex-wrap items-end gap-3">
                <Field label={t('menu.selectVenue')} className="min-w-[14rem]">
                  <Select
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
                  </Select>
                </Field>
                <Button variant="secondary" disabled={manager.busy} onClick={() => manager.updateTemplate(templateForm)}>
                  {t('menu.saveTemplate')}
                </Button>
              </div>

              <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
                <Button variant="subtle" size="sm" disabled={manager.busy} onClick={() => manager.loadSuggestions()}>
                  <SparkIcon className="h-4 w-4" />
                  {t('menu.autoTranslate')}
                </Button>
                <Button
                  variant="subtle"
                  size="sm"
                  disabled={manager.busy}
                  onClick={() => manager.exportCsv().catch((e) => setLocalError(friendlyError(e)))}
                >
                  <DownloadIcon className="h-4 w-4" />
                  {t('menu.exportCsv')}
                </Button>
                <Button variant="subtle" size="sm" disabled={manager.busy} onClick={() => fileInputRef.current?.click()}>
                  {t('menu.importCsv')}
                </Button>
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
              </div>
            </SectionCard>

            <SectionCard title={t('menu.addCategory')}>
              <BilingualField
                labelEn={t('menu.nameEn')}
                labelAr={t('menu.nameAr')}
                nameEn={newCategory.nameEn}
                nameAr={newCategory.nameAr}
                missingLabel={t('menu.missingTranslation')}
                onNameEnChange={(v) => setNewCategory({ ...newCategory, nameEn: v })}
                onNameArChange={(v) => setNewCategory({ ...newCategory, nameAr: v })}
              />
              <Button
                variant="secondary"
                size="sm"
                className="mt-3"
                disabled={manager.busy || !newCategory.nameEn.trim()}
                onClick={() =>
                  manager.addCategory(newCategory).then(() => setNewCategory({ nameEn: '', nameAr: '' }))
                }
              >
                <PlusIcon className="h-4 w-4" />
                {t('menu.addCategory')}
              </Button>
            </SectionCard>

            {manager.detail.categories?.length ? (
              manager.detail.categories.map((category, index) => (
                <CategorySection
                  key={category.id}
                  t={t}
                  language={i18n.language}
                  category={category}
                  canEdit={isHub}
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
              <div className="surface-card">
                <EmptyState icon={MenuIcon} title={t('menu.noCategories')} className="py-12" />
              </div>
            )}
          </div>
        ) : (
          <div className="surface-card">
            <EmptyState icon={MenuIcon} title={t('menu.templates')} hint={t('menu.readOnlyPosNote')} className="py-20" />
          </div>
        )}
      </div>

      <Drawer
        open={showNewTemplate}
        onClose={() => setShowNewTemplate(false)}
        size="md"
        icon={MenuIcon}
        title={t('menu.createTemplate')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowNewTemplate(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="primary"
              disabled={manager.busy || !newTemplate.nameEn.trim()}
              onClick={() =>
                manager.createTemplate(newTemplate).then(() => {
                  setNewTemplate({ nameEn: '', nameAr: '', venueIds: [] });
                  setShowNewTemplate(false);
                })
              }
            >
              {t('common.save')}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <BilingualField
            labelEn={t('menu.nameEn')}
            labelAr={t('menu.nameAr')}
            nameEn={newTemplate.nameEn}
            nameAr={newTemplate.nameAr}
            missingLabel={t('menu.missingTranslation')}
            onNameEnChange={(v) => setNewTemplate({ ...newTemplate, nameEn: v })}
            onNameArChange={(v) => setNewTemplate({ ...newTemplate, nameAr: v })}
          />
          <Field label={t('menu.selectVenue')}>
            <Select
              value={newTemplate.venueIds[0] ?? ''}
              onChange={(e) =>
                setNewTemplate({ ...newTemplate, venueIds: e.target.value ? [e.target.value] : [] })
              }
            >
              <option value="">{t('menu.selectVenue')}</option>
              {manager.venues.map((v) => (
                <option key={v.id} value={v.id}>
                  {menuLabel(v, i18n.language)}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Drawer>

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

      {(manager.editingItem || addingItemCategoryId) && isHub ? (
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
