import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch, apiFetchBlob } from '../api/client.js';
import { countMissingTranslations } from '../utils/menuTranslations.js';

export function useMenuManager({ canEdit, enabled = true }) {
  const [templates, setTemplates] = useState([]);
  const [venues, setVenues] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showPublishConfirm, setShowPublishConfirm] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showAutoTranslate, setShowAutoTranslate] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [editingItem, setEditingItem] = useState(null);

  const missingCount = useMemo(
    () => (detail ? countMissingTranslations(detail) : 0),
    [detail],
  );

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
    if (!enabled) return;
    load().catch((e) => setError(e.message));
  }, [load, enabled]);

  useEffect(() => {
    if (!enabled || !selectedId) return;
    loadDetail(selectedId).catch((e) => setError(e.message));
  }, [selectedId, loadDetail, enabled]);

  const run = useCallback(
    async (action) => {
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
    },
    [load, loadDetail, selectedId],
  );

  const createTemplate = useCallback(
    (payload) =>
      run(async () => {
        const created = await apiFetch('/api/v1/menu-templates', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        setSelectedId(created.id);
      }),
    [run],
  );

  const updateTemplate = useCallback(
    (payload) =>
      run(() =>
        apiFetch(`/api/v1/menu-templates/${selectedId}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        }),
      ),
    [run, selectedId],
  );

  const addCategory = useCallback(
    (payload) =>
      run(() =>
        apiFetch(`/api/v1/menu-templates/${selectedId}/categories`, {
          method: 'POST',
          body: JSON.stringify(payload),
        }),
      ),
    [run, selectedId],
  );

  const reorderCategories = useCallback(
    (orderedIds) =>
      run(() =>
        apiFetch(`/api/v1/menu-templates/${selectedId}/categories/reorder`, {
          method: 'PUT',
          body: JSON.stringify({ orderedIds }),
        }),
      ),
    [run, selectedId],
  );

  const addItem = useCallback(
    (categoryId, payload) =>
      run(() =>
        apiFetch(`/api/v1/categories/${categoryId}/items`, {
          method: 'POST',
          body: JSON.stringify(payload),
        }),
      ),
    [run],
  );

  const updateItem = useCallback(
    (itemId, payload) =>
      run(async () => {
        await apiFetch(`/api/v1/menu-items/${itemId}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
        setEditingItem(null);
      }),
    [run],
  );

  const toggleAvailability = useCallback(
    (item) =>
      run(() =>
        apiFetch(`/api/v1/menu-items/${item.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ isAvailable: !item.isAvailable }),
        }),
      ),
    [run],
  );

  const publish = useCallback(
    () =>
      run(async () => {
        await apiFetch(`/api/v1/menu-templates/${selectedId}/publish`, { method: 'POST' });
        setShowPublishConfirm(false);
      }),
    [run, selectedId],
  );

  const exportCsv = useCallback(async () => {
    const blob = await apiFetchBlob(`/api/v1/menu-templates/${selectedId}/translations/export`);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `menu-translations-${selectedId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [selectedId]);

  const importCsv = useCallback(
    (csv) =>
      run(() =>
        apiFetch(`/api/v1/menu-templates/${selectedId}/translations/import`, {
          method: 'POST',
          body: JSON.stringify({ csv }),
        }),
      ),
    [run, selectedId],
  );

  const loadSuggestions = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const result = await apiFetch(`/api/v1/menu-templates/${selectedId}/translations/suggest`);
      setSuggestions(
        result.suggestions.map((s) => ({
          ...s,
          nameAr: s.suggestedAr,
        })),
      );
      setShowAutoTranslate(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }, [selectedId]);

  const applySuggestions = useCallback(
    () =>
      run(async () => {
        await apiFetch(`/api/v1/menu-templates/${selectedId}/translations/apply`, {
          method: 'POST',
          body: JSON.stringify({
            updates: suggestions.map((s) => ({
              entityType: s.entityType,
              entityId: s.entityId,
              nameAr: s.nameAr,
            })),
          }),
        });
        setShowAutoTranslate(false);
        setSuggestions([]);
      }),
    [run, selectedId, suggestions],
  );

  return {
    templates,
    venues,
    selectedId,
    setSelectedId,
    detail,
    error,
    busy,
    canEdit,
    missingCount,
    showPublishConfirm,
    setShowPublishConfirm,
    showPreview,
    setShowPreview,
    showAutoTranslate,
    setShowAutoTranslate,
    suggestions,
    setSuggestions,
    editingItem,
    setEditingItem,
    createTemplate,
    updateTemplate,
    addCategory,
    reorderCategories,
    addItem,
    updateItem,
    toggleAvailability,
    publish,
    exportCsv,
    importCsv,
    loadSuggestions,
    applySuggestions,
  };
}
