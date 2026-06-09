import { useCallback, useMemo, useState } from 'react';
import { callAgent } from '../api/agent.js';

/**
 * Cross-sell mode on the anchor POS: toggle + venue tabs + per-venue menu fetch.
 * Integrates into the main screen — no separate ordering session.
 */
export function useCrossSell(features, homeVenueId) {
  const [crossSellMode, setCrossSellMode] = useState(false);
  const [activeVenueId, setActiveVenueId] = useState(homeVenueId ?? null);
  const [remoteMenus, setRemoteMenus] = useState({});
  const [menuLoading, setMenuLoading] = useState(false);
  const [activeCategoryId, setActiveCategoryId] = useState('all');

  const venues = useMemo(() => {
    const list = [];
    if (features?.anchorVenue) list.push(features.anchorVenue);
    for (const target of features?.crossVenueTargets ?? []) {
      if (!list.some((v) => v.id === target.id)) list.push(target);
    }
    return list;
  }, [features]);

  const canCrossSell = Boolean(features?.crossVenueBilling && venues.length > 1);

  const loadMenuForVenue = useCallback(async (venueId) => {
    if (!venueId || venueId === homeVenueId) return null;
    setMenuLoading(true);
    try {
      const data = await callAgent(`/v1/cross-venue/menu/${venueId}`);
      setRemoteMenus((prev) => ({ ...prev, [venueId]: data }));
      return data;
    } catch {
      return null;
    } finally {
      setMenuLoading(false);
    }
  }, [homeVenueId]);

  const selectVenue = useCallback(
    async (venueId) => {
      setActiveVenueId(venueId);
      setActiveCategoryId('all');
      if (venueId && venueId !== homeVenueId && !remoteMenus[venueId]) {
        await loadMenuForVenue(venueId);
      }
    },
    [homeVenueId, remoteMenus, loadMenuForVenue],
  );

  const enableCrossSell = useCallback(() => {
    if (!canCrossSell) return;
    setCrossSellMode(true);
    if (homeVenueId) setActiveVenueId(homeVenueId);
  }, [canCrossSell, homeVenueId]);

  const disableCrossSell = useCallback(() => {
    setCrossSellMode(false);
    if (homeVenueId) setActiveVenueId(homeVenueId);
    setActiveCategoryId('all');
  }, [homeVenueId]);

  const setCrossSellModeSafe = useCallback(
    (enabled) => {
      if (enabled) enableCrossSell();
      else disableCrossSell();
    },
    [enableCrossSell, disableCrossSell],
  );

  const lockCrossSell = useCallback(() => {
    setCrossSellMode(true);
    if (homeVenueId) setActiveVenueId(homeVenueId);
  }, [homeVenueId]);

  function menuForVenue(venueId, homeMenu) {
    if (!venueId || venueId === homeVenueId) return homeMenu;
    return remoteMenus[venueId] ?? null;
  }

  function displayItemsFor(menu, categoryId) {
    const categories = menu?.categories ?? [];
    const allItems = categories.flatMap((c) => c.items ?? []);
    if (categoryId === 'all') return allItems;
    return categories.find((c) => c.id === categoryId)?.items ?? [];
  }

  return {
    canCrossSell,
    crossSellMode,
    setCrossSellMode: setCrossSellModeSafe,
    lockCrossSell,
    venues,
    activeVenueId,
    selectVenue,
    activeCategoryId,
    setActiveCategoryId,
    menuLoading,
    menuForVenue,
    displayItemsFor,
    getActiveMenu: (homeMenu) => menuForVenue(activeVenueId, homeMenu),
    getDisplayItems: (homeMenu) => {
      const menu = menuForVenue(activeVenueId, homeMenu);
      return displayItemsFor(menu, activeCategoryId);
    },
    isRemoteVenue: Boolean(activeVenueId && activeVenueId !== homeVenueId),
  };
}
