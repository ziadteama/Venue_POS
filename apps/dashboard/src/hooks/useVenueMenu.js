import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../api/client.js';
import { friendlyError } from '../utils/apiError.js';

export function useVenueMenu({ enabled = true }) {
  const [venues, setVenues] = useState([]);
  const [selectedVenueId, setSelectedVenueId] = useState(null);
  const [menu, setMenu] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showPublishConfirm, setShowPublishConfirm] = useState(false);
  const [editingItem, setEditingItem] = useState(null);

  const loadVenues = useCallback(async () => {
    const list = await apiFetch('/api/v1/venues');
    setVenues(list);
    if (!selectedVenueId && list[0]) setSelectedVenueId(list[0].id);
  }, [selectedVenueId]);

  const loadMenu = useCallback(async (venueId) => {
    if (!venueId) return;
    setMenu(await apiFetch(`/api/v1/manager/venues/${venueId}/menu`));
  }, []);

  useEffect(() => {
    if (!enabled) return;
    loadVenues().catch((e) => setError(friendlyError(e)));
  }, [loadVenues, enabled]);

  useEffect(() => {
    if (!enabled || !selectedVenueId) return;
    loadMenu(selectedVenueId).catch((e) => setError(friendlyError(e)));
  }, [selectedVenueId, loadMenu, enabled]);

  const run = useCallback(
    async (action) => {
      setBusy(true);
      setError('');
      try {
        const result = await action();
        if (result) setMenu(result);
        else if (selectedVenueId) await loadMenu(selectedVenueId);
      } catch (e) {
        setError(friendlyError(e));
      } finally {
        setBusy(false);
      }
    },
    [loadMenu, selectedVenueId],
  );

  const addCategory = useCallback(
    (data) =>
      run(() =>
        apiFetch(`/api/v1/manager/venues/${selectedVenueId}/menu/categories`, {
          method: 'POST',
          body: JSON.stringify(data),
        }),
      ),
    [run, selectedVenueId],
  );

  const deleteCategory = useCallback(
    (categoryId) =>
      run(() =>
        apiFetch(`/api/v1/manager/venues/${selectedVenueId}/menu/categories/${categoryId}`, {
          method: 'DELETE',
        }),
      ),
    [run, selectedVenueId],
  );

  const reorderCategories = useCallback(
    (orderedIds) =>
      run(() =>
        apiFetch(`/api/v1/manager/venues/${selectedVenueId}/menu/categories/reorder`, {
          method: 'PUT',
          body: JSON.stringify({ orderedIds }),
        }),
      ),
    [run, selectedVenueId],
  );

  const addItem = useCallback(
    (categoryId, data) =>
      run(() =>
        apiFetch(`/api/v1/manager/venues/${selectedVenueId}/menu/categories/${categoryId}/items`, {
          method: 'POST',
          body: JSON.stringify(data),
        }),
      ),
    [run, selectedVenueId],
  );

  const updateItem = useCallback(
    (itemId, data) =>
      run(() =>
        apiFetch(`/api/v1/manager/venues/${selectedVenueId}/menu/items/${itemId}`, {
          method: 'PATCH',
          body: JSON.stringify(data),
        }),
      ),
    [run, selectedVenueId],
  );

  const deleteItem = useCallback(
    (itemId) =>
      run(() =>
        apiFetch(`/api/v1/manager/venues/${selectedVenueId}/menu/items/${itemId}`, {
          method: 'DELETE',
        }),
      ),
    [run, selectedVenueId],
  );

  const setItemModifiers = useCallback(
    (itemId, modifierGroupIds) =>
      run(() =>
        apiFetch(`/api/v1/manager/venues/${selectedVenueId}/menu/items/${itemId}/modifiers`, {
          method: 'PUT',
          body: JSON.stringify({ modifierGroupIds }),
        }),
      ),
    [run, selectedVenueId],
  );

  const toggleAvailability = useCallback(
    (item) => updateItem(item.id, { isAvailable: !item.isAvailable }),
    [updateItem],
  );

  const addModifierGroup = useCallback(
    (data) =>
      run(() =>
        apiFetch(`/api/v1/manager/venues/${selectedVenueId}/menu/modifier-groups`, {
          method: 'POST',
          body: JSON.stringify(data),
        }),
      ),
    [run, selectedVenueId],
  );

  const deleteModifierGroup = useCallback(
    (groupId) =>
      run(() =>
        apiFetch(`/api/v1/manager/venues/${selectedVenueId}/menu/modifier-groups/${groupId}`, {
          method: 'DELETE',
        }),
      ),
    [run, selectedVenueId],
  );

  const addModifierOption = useCallback(
    (groupId, data) =>
      run(() =>
        apiFetch(`/api/v1/manager/venues/${selectedVenueId}/menu/modifier-groups/${groupId}/options`, {
          method: 'POST',
          body: JSON.stringify(data),
        }),
      ),
    [run, selectedVenueId],
  );

  const publish = useCallback(
    () =>
      run(async () => {
        const result = await apiFetch(`/api/v1/manager/venues/${selectedVenueId}/menu/publish`, {
          method: 'POST',
        });
        setShowPublishConfirm(false);
        return result;
      }),
    [run, selectedVenueId],
  );

  const saveItem = useCallback(
    async (payload, editing) => {
      const { categoryId, modifierGroupIds, ...itemData } = payload;
      setBusy(true);
      setError('');
      try {
        if (editing?.id) {
          let result = await apiFetch(
            `/api/v1/manager/venues/${selectedVenueId}/menu/items/${editing.id}`,
            { method: 'PATCH', body: JSON.stringify(itemData) },
          );
          if (modifierGroupIds) {
            result = await apiFetch(
              `/api/v1/manager/venues/${selectedVenueId}/menu/items/${editing.id}/modifiers`,
              { method: 'PUT', body: JSON.stringify({ modifierGroupIds }) },
            );
          }
          setMenu(result);
        } else {
          let result = await apiFetch(
            `/api/v1/manager/venues/${selectedVenueId}/menu/categories/${categoryId}/items`,
            { method: 'POST', body: JSON.stringify(itemData) },
          );
          const created = result.categories
            ?.find((c) => c.id === categoryId)
            ?.items?.find((i) => i.nameEn === itemData.nameEn);
          if (created && modifierGroupIds?.length) {
            result = await apiFetch(
              `/api/v1/manager/venues/${selectedVenueId}/menu/items/${created.id}/modifiers`,
              { method: 'PUT', body: JSON.stringify({ modifierGroupIds }) },
            );
          }
          setMenu(result);
        }
      } catch (e) {
        setError(friendlyError(e));
        throw e;
      } finally {
        setBusy(false);
      }
    },
    [selectedVenueId],
  );

  return {
    venues,
    selectedVenueId,
    setSelectedVenueId,
    menu,
    error,
    busy,
    showPublishConfirm,
    setShowPublishConfirm,
    editingItem,
    setEditingItem,
    addCategory,
    deleteCategory,
    reorderCategories,
    addItem,
    updateItem,
    deleteItem,
    setItemModifiers,
    toggleAvailability,
    addModifierGroup,
    deleteModifierGroup,
    addModifierOption,
    publish,
    saveItem,
  };
}
