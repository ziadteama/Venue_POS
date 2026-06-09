import { useEffect } from 'react';
import { io } from 'socket.io-client';
import { API_URL, TERMINAL_ID, TERMINAL_SECRET } from '../config.js';

export function useManagerNotifications(onNotification) {
  useEffect(() => {
    if (!onNotification) return undefined;

    function handlePayload(payload) {
      if (!payload?.type) return;
      onNotification(payload);
    }

    if (window.venuePos?.onManagerNotification) {
      return window.venuePos.onManagerNotification(handlePayload);
    }

    if (!TERMINAL_ID || !TERMINAL_SECRET) return undefined;

    const socket = io(API_URL, {
      path: '/socket.io',
      auth: { terminalId: TERMINAL_ID, terminalSecret: TERMINAL_SECRET, clientType: 'pos' },
      transports: ['websocket'],
    });
    socket.on('manager:notification', (msg) => handlePayload(msg?.payload ?? msg));
    return () => socket.disconnect();
  }, [onNotification]);
}
