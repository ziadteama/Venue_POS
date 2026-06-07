import { useCallback, useMemo, useState } from 'react';
import { callAgent } from '../api/agent.js';

const DRAFT_ORDER_STUB = { status: 'draft' };

/**
 * Cross-venue ordering on an anchor terminal. Online-only: browse linked venue
 * menus, add items per venue, fire each kitchen, pay once.
 */
export function useCrossVenue(cashierId, features) {
  const [open, setOpen] = useState(false);
  const [group, setGroup] = useState(null);
  const [activeVenueId, setActiveVenueId] = useState(null);
  const [menus, setMenus] = useState({});
  const [menuLoading, setMenuLoading] = useState(false);
  const [activeCategoryId, setActiveCategoryId] = useState('all');
  const [step, setStep] = useState('order');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const venues = useMemo(() => {
    const list = [];
    if (features?.anchorVenue) list.push(features.anchorVenue);
    for (const target of features?.crossVenueTargets ?? []) {
      if (!list.some((v) => v.id === target.id)) list.push(target);
    }
    return list;
  }, [features]);

  const menu = activeVenueId ? menus[activeVenueId] : null;

  const allItems = useMemo(
    () => menu?.categories?.flatMap((c) => c.items ?? []) ?? [],
    [menu],
  );

  const activeCategory = useMemo(() => {
    if (activeCategoryId === 'all') return null;
    return menu?.categories?.find((c) => c.id === activeCategoryId);
  }, [menu, activeCategoryId]);

  const displayItems = useMemo(() => {
    if (activeCategoryId === 'all') return allItems;
    return activeCategory?.items ?? [];
  }, [activeCategoryId, allItems, activeCategory]);

  const loadMenuForVenue = useCallback(async (venueId) => {
    if (!venueId) return;
    setMenuLoading(true);
    setError('');
    try {
      const data = await callAgent(`/v1/cross-venue/menu/${venueId}`);
      setMenus((prev) => ({ ...prev, [venueId]: data }));
    } catch (err) {
      setError(err.message || 'Could not load menu for this venue');
    } finally {
      setMenuLoading(false);
    }
  }, []);

  const selectVenue = useCallback(
    async (venueId) => {
      setActiveVenueId(venueId);
      setActiveCategoryId('all');
      if (!menus[venueId]) await loadMenuForVenue(venueId);
    },
    [menus, loadMenuForVenue],
  );

  const openModal = useCallback(
    async (tableLabel) => {
      setOpen(true);
      setStep('order');
      setGroup(null);
      setMenus({});
      setError('');
      setBusy(true);
      try {
        const started = await callAgent('/v1/cross-venue/order', {
          method: 'POST',
          body: JSON.stringify({
            cashierId,
            tableLabel: tableLabel || undefined,
          }),
        });
        setGroup(started);
        const homeId = started.anchorVenueId ?? features?.anchorVenue?.id ?? venues[0]?.id;
        if (homeId) {
          setActiveVenueId(homeId);
          await loadMenuForVenue(homeId);
        }
      } catch (err) {
        setError(err.message || 'Cross-venue ordering is unavailable (hub offline)');
        setOpen(false);
      } finally {
        setBusy(false);
      }
    },
    [cashierId, features?.anchorVenue?.id, venues, loadMenuForVenue],
  );

  const closeModal = useCallback(async () => {
    if (group?.groupId && group.status !== 'paid' && step !== 'done') {
      try {
        await callAgent(`/v1/cross-venue/order/${group.groupId}/cancel`, {
          method: 'POST',
          body: JSON.stringify({ cashierId }),
        });
      } catch {
        // best-effort release
      }
    }
    setOpen(false);
    setGroup(null);
    setActiveVenueId(null);
    setMenus({});
    setStep('order');
    setError('');
  }, [cashierId, group, step]);

  const addItem = useCallback(
    async (item) => {
      if (!group?.groupId || !activeVenueId) return;
      setBusy(true);
      setError('');
      try {
        const updated = await callAgent(`/v1/cross-venue/order/${group.groupId}/items`, {
          method: 'POST',
          body: JSON.stringify({
            cashierId,
            venueId: activeVenueId,
            menuItemId: item.id,
            quantity: 1,
          }),
        });
        setGroup(updated);
      } catch (err) {
        setError(err.message || 'Could not add item');
      } finally {
        setBusy(false);
      }
    },
    [cashierId, group?.groupId, activeVenueId],
  );

  const changeQty = useCallback(
    async (venueId, itemId, quantity) => {
      if (!group?.groupId) return;
      setBusy(true);
      setError('');
      try {
        let updated;
        if (quantity <= 0) {
          updated = await callAgent(
            `/v1/cross-venue/order/${group.groupId}/items/${itemId}?venueId=${venueId}`,
            { method: 'DELETE' },
          );
        } else {
          updated = await callAgent(
            `/v1/cross-venue/order/${group.groupId}/items/${itemId}?venueId=${venueId}`,
            {
              method: 'PATCH',
              body: JSON.stringify({ quantity }),
            },
          );
        }
        setGroup(updated);
      } catch (err) {
        setError(err.message || 'Could not update item');
      } finally {
        setBusy(false);
      }
    },
    [group?.groupId],
  );

  const fireAll = useCallback(async () => {
    if (!group?.groupId) return;
    setBusy(true);
    setError('');
    try {
      const result = await callAgent(`/v1/cross-venue/order/${group.groupId}/fire`, {
        method: 'POST',
        body: JSON.stringify({ cashierId }),
      });
      setGroup(result.group);
    } catch (err) {
      setError(err.message || 'Could not send to kitchen');
    } finally {
      setBusy(false);
    }
  }, [cashierId, group?.groupId]);

  const backToOrder = useCallback(() => {
    setStep('order');
    setError('');
  }, []);

  const goToPay = useCallback(() => {
    if ((group?.pendingTotal ?? 0) > 0) {
      setError('Send all items to the kitchen before paying');
      return;
    }
    if ((group?.combinedTotal ?? 0) <= 0) {
      setError('Add items before paying');
      return;
    }
    setStep('pay');
    setError('');
  }, [group]);

  const payGroup = useCallback(
    async ({ method = 'cash', cardLast4, tendered, managerPin } = {}) => {
      if (!group?.groupId) return null;
      setBusy(true);
      setError('');
      try {
        const result = await callAgent(`/v1/cross-venue/order/${group.groupId}/pay`, {
          method: 'POST',
          body: JSON.stringify({
            cashierId,
            method,
            cardLast4,
            tendered,
            managerPin,
          }),
        });
        setGroup(result.group);
        setStep('done');
        return result;
      } catch (err) {
        setError(err.message || 'Payment failed');
        return null;
      } finally {
        setBusy(false);
      }
    },
    [cashierId, group?.groupId],
  );

  return {
    open,
    openModal,
    closeModal,
    group,
    venues,
    activeVenueId,
    selectVenue,
    menu,
    menuLoading,
    activeCategoryId,
    setActiveCategoryId,
    displayItems,
    draftOrderStub: DRAFT_ORDER_STUB,
    step,
    busy,
    error,
    setError,
    addItem,
    changeQty,
    fireAll,
    goToPay,
    backToOrder,
    payGroup,
  };
}
