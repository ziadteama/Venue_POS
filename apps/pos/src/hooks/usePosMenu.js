import { useCallback, useEffect, useMemo, useState } from 'react';
import { callAgent } from '../api/agent.js';
import { subscribeAgentEventStream } from './agentEventStreamClient.js';

/** Menu load, category filter, and search — no cheque/session logic. */
export function usePosMenu() {
  const [menu, setMenu] = useState(null);
  const [activeCategoryId, setActiveCategoryId] = useState('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [menuError, setMenuError] = useState('');

  const loadMenu = useCallback(async () => {
    setLoading(true);
    setMenuError('');
    try {
      let data = await callAgent('/v1/menu');
      if (!data.categories?.length) {
        try {
          await callAgent('/v1/menu/sync', { method: 'POST' });
          data = await callAgent('/v1/menu');
        } catch {
          setMenuError('menuNotCached');
        }
      }
      if (!data.categories?.length) {
        setMenuError('menuNotCached');
      }
      setMenu(data?.categories?.length ? data : null);
    } catch {
      setMenu(null);
      setMenuError('menuNotCached');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMenu();
  }, [loadMenu]);

  useEffect(() => {
    return subscribeAgentEventStream({
      onMenuUpdated: () => {
        loadMenu();
      },
    });
  }, [loadMenu]);

  const allItems = useMemo(
    () => menu?.categories?.flatMap((c) => c.items ?? []) ?? [],
    [menu],
  );

  const activeCategory = useMemo(() => {
    if (activeCategoryId === 'all') return null;
    return menu?.categories?.find((c) => c.id === activeCategoryId);
  }, [menu, activeCategoryId]);

  const displayItems = useMemo(() => {
    const base = activeCategoryId === 'all' ? allItems : (activeCategory?.items ?? []);
    const q = search.trim().toLowerCase();
    if (!q) return base;
    return base.filter(
      (item) =>
        item.nameEn.toLowerCase().includes(q) || item.nameAr.toLowerCase().includes(q),
    );
  }, [activeCategoryId, allItems, activeCategory, search]);

  return {
    menu,
    loading,
    menuError,
    activeCategoryId,
    setActiveCategoryId,
    search,
    setSearch,
    displayItems,
    loadMenu,
  };
}
