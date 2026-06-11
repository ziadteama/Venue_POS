import { useEffect } from 'react';
import { io } from 'socket.io-client';
import { API_URL, TERMINAL_ID, TERMINAL_SECRET } from '../config.js';

export function useManagerSocket(chequeId, onAction) {
  useEffect(() => {
    if (!onAction) return undefined;

    function handlePayload(payload) {
      if (!payload?.chequeId || payload.chequeId !== chequeId) return;
      onAction(payload);
    }

    if (window.venuePos?.onManagerAction) {
      return window.venuePos.onManagerAction(handlePayload);
    }
    if (!TERMINAL_ID() || !TERMINAL_SECRET() || !chequeId) return undefined;

    const socket = io(API_URL(), {
      path: '/socket.io',
      auth: {
        terminalId: TERMINAL_ID(),
        terminalSecret: TERMINAL_SECRET(),
        clientType: 'pos',
      },
      transports: ['websocket'],
    });
    socket.on('manager:action', (msg) => handlePayload(msg?.payload ?? msg));
    return () => socket.disconnect();
  }, [chequeId, onAction]);
}
