import { useEffect } from 'react';
import { io } from 'socket.io-client';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export function useMetricsSocket(token, onTick) {
  useEffect(() => {
    if (!token || !onTick) return undefined;

    const socket = io(API_URL, {
      path: '/socket.io',
      auth: { token, clientType: 'dashboard' },
      transports: ['websocket'],
    });

    socket.on('dashboard:metrics_tick', (msg) => {
      onTick(msg?.payload ?? msg);
    });

    return () => {
      socket.disconnect();
    };
  }, [token, onTick]);
}
