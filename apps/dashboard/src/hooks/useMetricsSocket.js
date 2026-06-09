import { useEffect } from 'react';
import { io } from 'socket.io-client';
import { API_URL, invalidateAuthSession, isAuthFailure } from '../api/client.js';

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

    socket.on('connect_error', (err) => {
      if (isAuthFailure(err?.message)) invalidateAuthSession();
    });

    return () => {
      socket.disconnect();
    };
  }, [token, onTick]);
}
