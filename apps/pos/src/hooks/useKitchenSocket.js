import { useCallback, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { API_URL, TERMINAL_ID, TERMINAL_SECRET } from '../config.js';

export function useKitchenSocket(enabled = true) {
  const [kitchenWatch, setKitchenWatch] = useState(null);

  useEffect(() => {
    if (!enabled) setKitchenWatch(null);
  }, [enabled]);

  const applyItemStatus = useCallback((payload) => {
    if (!payload?.orderId) return;
    setKitchenWatch((prev) => {
      if (!prev || prev.id !== payload.orderId) return prev;
      const items = payload.items?.length
        ? payload.items
        : prev.items.map((item) =>
            item.id === payload.itemId ? { ...item, kitchenStatus: payload.status } : item,
          );
      const next = { ...prev, status: payload.orderStatus ?? prev.status, items };
      if (next.status === 'served') return null;
      return next;
    });
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;
    if (window.venuePos?.onItemStatusChange) {
      return window.venuePos.onItemStatusChange(applyItemStatus);
    }
    if (!TERMINAL_ID || !TERMINAL_SECRET) return undefined;
    const socket = io(API_URL, {
      path: '/socket.io',
      auth: { terminalId: TERMINAL_ID, terminalSecret: TERMINAL_SECRET, clientType: 'pos' },
      transports: ['websocket'],
    });
    socket.on('order:item_status', (msg) => applyItemStatus(msg?.payload ?? msg));
    return () => socket.disconnect();
  }, [applyItemStatus, enabled]);

  return { kitchenWatch, setKitchenWatch };
}
