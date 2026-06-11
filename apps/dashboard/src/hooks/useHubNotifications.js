import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { SOCKET_ORIGIN, invalidateAuthSession, isAuthFailure } from '../api/client.js';

export function useHubNotifications(token) {
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    if (!token) return undefined;

    const socket = io(SOCKET_ORIGIN, {
      path: '/socket.io',
      auth: { token, clientType: 'dashboard' },
      transports: ['websocket'],
    });

    const handle = (msg) => {
      const payload = msg?.payload ?? msg;
      setNotice({
        id: `${payload.type}-${payload.chequeNumber ?? ''}-${Date.now()}`,
        payload,
      });
    };

    socket.on('manager:notification', handle);

    socket.on('connect_error', (err) => {
      if (isAuthFailure(err?.message)) invalidateAuthSession();
    });

    return () => {
      socket.disconnect();
    };
  }, [token]);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = setTimeout(() => setNotice(null), 15000);
    return () => clearTimeout(timer);
  }, [notice]);

  return { notice, setNotice };
}
