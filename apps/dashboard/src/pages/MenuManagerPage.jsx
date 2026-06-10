import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../hooks/useAuth.js';
import { useVenueMenu } from '../hooks/useVenueMenu.js';
import { friendlyError } from '../utils/apiError.js';
import { BilingualField } from '../components/menu/BilingualField.jsx';
import {
  CategorySection,
  ItemEditorDrawer,
  ModifierGroupsSection,
} from '../components/menu/MenuEditor.jsx';
import { PublishConfirmModal } from '../components/menu/PublishConfirmModal.jsx';
import { menuLabel } from '../utils/menuLabel.js';
import { PageHeader } from '../components/dashboard/PageHeader.jsx';
import { SectionCard } from '../components/ui/Card.jsx';
import { Button } from '../components/ui/Button.jsx';
import { StatusBadge } from '../components/ui/Badge.jsx';
import { EmptyState } from '../components/ui/EmptyState.jsx';
import { MenuIcon, PlusIcon, AlertIcon } from '../components/dashboard/icons.jsx';

export function MenuManagerPage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const isHub = user?.role === 'hub_manager';
  const manager = useVenueMenu({ enabled: isHub });
  const dragFrom = useRef(null);
  const [localError, setLocalError] = useState('');
  const [newCategory, setNewCategory] = useState({ nameEn: '', nameAr: '' });
  const [addingItemCategoryId, setAddingItemCategoryId] = useState(null);

  function handleDragStart(index) {
    dragFrom.current = index;
  }

  function handleDrop(index) {
    if (dragFrom.current == null || dragFrom.current === index || !manager.menu?.categories) {
      dragFrom.current = null;
      return;
    }
    const categories = [...manager.menu.categories];
    const [moved] = categories.splice(dragFrom.current, 1);
    categories.splice(index, 0, moved);
    dragFrom.current = null;
    manager.reorderCategories(categories.map((c) => c.id));
  }

  async function handleSaveItem(payload) {
    try {
      await manager.saveItem(payload, manager.editingItem);
      manager.setEditingItem(null);
      setAddingItemCategoryId(null);
    } catch (e) {
      setLocalError(friendlyError(e));
    }
  }

  if (!isHub) {
    return (
      <div className="surface-card p-8 text-center text-sm text-slate-500">{t('menu.hubManagerOnly')}</div>
    );
  }

  const selectedVenue = manager.venues.find((v) => v.id === manager.selectedVenueId);

  return (
    <div className="space-y-6">
      <PageHeader title={t('menu.title')} subtitle={t('menu.readOnlyPosNote')} />

      {manager.error || localError ? (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          <AlertIcon className="h-5 w-5 shrink-0" />
          {manager.error || localError}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {manager.venues.map((venue) => {
          const active = manager.selectedVenueId === venue.id;
          return (
            <button
              key={venue.id}
              type="button"
              onClick={() => manager.setSelectedVenueId(venue.id)}
              className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                active
                  ? 'bg-accent-gradient text-white shadow-sm'
                  : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50'
              }`}
            >
              {menuLabel(venue, i18n.language)}
            </button>
          );
        })}
      </div>

      {manager.menu && selectedVenue ? (
        <div className="space-y-5">
          <SectionCard
            title={menuLabel(selectedVenue, i18n.language)}
            action={
              <div className="flex flex-wrap items-center gap-3">
                <StatusBadge
                  status={manager.menu.status === 'published' ? 'published' : 'draft'}
                  label={
                    manager.menu.status === 'published'
                      ? t('menu.statusPublished')
                      : t('menu.statusDraft')
                  }
                  dot={false}
                />
                {manager.menu.publishedAt ? (
                  <span className="text-xs text-slate-500">
                    {t('menu.lastPublished', {
                      date: new Date(manager.menu.publishedAt).toLocaleString(),
                    })}
                  </span>
                ) : null}
                <Button
                  variant="primary"
                  disabled={manager.busy}
                  onClick={() => manager.setShowPublishConfirm(true)}
                >
                  {t('menu.publish')}
                </Button>
              </div>
            }
          >
            <p className="text-sm text-slate-500">{t('menu.venueHint')}</p>
          </SectionCard>

          <SectionCard title={t('menu.addCategory')}>
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-[12rem] flex-1">
                <BilingualField
                  labelEn={t('menu.nameEn')}
                  labelAr={t('menu.nameAr')}
                  nameEn={newCategory.nameEn}
                  nameAr={newCategory.nameAr}
                  onNameEnChange={(v) => setNewCategory({ ...newCategory, nameEn: v })}
                  onNameArChange={(v) => setNewCategory({ ...newCategory, nameAr: v })}
                />
              </div>
              <Button
                variant="secondary"
                disabled={manager.busy || !newCategory.nameEn.trim()}
                onClick={() =>
                  manager.addCategory(newCategory).then(() => setNewCategory({ nameEn: '', nameAr: '' }))
                }
              >
                <PlusIcon className="h-4 w-4" />
                {t('menu.addCategory')}
              </Button>
            </div>
          </SectionCard>

          {manager.menu.categories?.length ? (
            manager.menu.categories.map((category, index) => (
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
                onDeleteCategory={() => manager.deleteCategory(category.id)}
                onDeleteItem={(item) => manager.deleteItem(item.id)}
              />
            ))
          ) : (
            <div className="surface-card">
              <EmptyState icon={MenuIcon} title={t('menu.noCategories')} className="py-12" />
            </div>
          )}

          <ModifierGroupsSection
            t={t}
            language={i18n.language}
            groups={manager.menu.modifierGroups ?? []}
            busy={manager.busy}
            onAddGroup={(data) => manager.addModifierGroup(data)}
            onDeleteGroup={(id) => manager.deleteModifierGroup(id)}
            onAddOption={(groupId, data) => manager.addModifierOption(groupId, data)}
          />
        </div>
      ) : (
        <div className="surface-card">
          <EmptyState icon={MenuIcon} title={t('menu.selectRestaurant')} className="py-20" />
        </div>
      )}

      {manager.showPublishConfirm ? (
        <PublishConfirmModal
          t={t}
          venueName={selectedVenue ? menuLabel(selectedVenue, i18n.language) : ''}
          busy={manager.busy}
          onCancel={() => manager.setShowPublishConfirm(false)}
          onConfirm={() => manager.publish()}
        />
      ) : null}

      {(manager.editingItem || addingItemCategoryId) && isHub ? (
        <ItemEditorDrawer
          t={t}
          item={manager.editingItem}
          categoryId={addingItemCategoryId ?? manager.editingItem?.categoryId}
          modifierGroups={manager.menu?.modifierGroups ?? []}
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
