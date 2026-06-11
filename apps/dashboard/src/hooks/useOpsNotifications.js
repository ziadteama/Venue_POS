import { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { OPS_SEVERITY } from '@venue-pos/shared';
import { SOCKET_ORIGIN, invalidateAuthSession, isAuthFailure } from '../api/client.js';

export function useOpsNotifications(token, { enabled = true } = {}) {
  const [healthTick, setHealthTick] = useState(null);
  const [latestAlert, setLatestAlert] = useState(null);
  const [notificationsEnabled, setNotificationsEnabled] = useState(
    () => typeof Notification !== 'undefined' && Notification.permission === 'granted',
  );
  const permissionRef = useRef(notificationsEnabled);

  const notifyDesktop = useCallback((event) => {
    if (!permissionRef.current || typeof Notification === 'undefined') return;
    if (event.severity === OPS_SEVERITY.INFO) return;
    try {
      new Notification(event.title, {
        body: event.message,
        tag: event.id,
      });
    } catch {
      // Browser may block without user gesture
    }
  }, []);

  const requestNotifications = useCallback(async () => {
    if (typeof Notification === 'undefined') return false;
    const permission = await Notification.requestPermission();
    const granted = permission === 'granted';
    permissionRef.current = granted;
    setNotificationsEnabled(granted);
    return granted;
  }, []);

  useEffect(() => {
    if (!token || !enabled) return undefined;

    const socket = io(SOCKET_ORIGIN, {
      path: '/socket.io',
      auth: { token, clientType: 'dashboard' },
      transports: ['websocket'],
    });

    socket.on('ops:alert', (msg) => {
      const payload = msg?.payload ?? msg;
      setLatestAlert(payload);
      notifyDesktop(payload);
    });

    socket.on('ops:health_tick', (msg) => {
      setHealthTick(msg?.payload ?? msg);
    });

    socket.on('connect_error', (err) => {
      if (isAuthFailure(err?.message)) invalidateAuthSession();
    });

    return () => {
      socket.disconnect();
    };
  }, [token, enabled, notifyDesktop]);

  return {
    healthTick,
    latestAlert,
    notificationsEnabled,
    requestNotifications,
    clearLatestAlert: () => setLatestAlert(null),
  };
}
