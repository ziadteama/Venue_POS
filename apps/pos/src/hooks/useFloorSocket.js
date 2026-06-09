import { useEffect } from 'react';
import { io } from 'socket.io-client';
import { API_URL, TERMINAL_ID, TERMINAL_SECRET } from '../config.js';

/** Live hub floor updates when WAN is up (Slice D). */
export function useFloorSocket({ enabled, online, onFloorUpdate }) {
  useEffect(() => {
    if (!enabled || !online) return undefined;

    if (window.venuePos?.onFloorTableUpdated) {
      return window.venuePos.onFloorTableUpdated((payload) => onFloorUpdate?.(payload));
    }

    if (!TERMINAL_ID || !TERMINAL_SECRET) return undefined;

    const socket = io(API_URL, {
      path: '/socket.io',
      auth: { terminalId: TERMINAL_ID, terminalSecret: TERMINAL_SECRET, clientType: 'pos' },
      transports: ['websocket'],
    });

    const handler = (msg) => {
      const payload = msg?.payload ?? msg;
      if (payload?.tableLabel) onFloorUpdate?.(payload);
    };

    socket.on('floor:table_updated', handler);
    return () => socket.disconnect();
  }, [enabled, online, onFloorUpdate]);
}
