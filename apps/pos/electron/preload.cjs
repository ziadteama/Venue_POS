const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const { contextBridge } = require('electron');
const { io } = require('socket.io-client');

let posSocket;
function ensurePosSocket() {
  if (!posSocket) {
    posSocket = io(apiUrl, {
      path: '/socket.io',
      auth: { terminalId, terminalSecret, clientType: 'pos' },
      transports: ['websocket'],
    });
  }
  return posSocket;
}

const agentUrl = process.env.VITE_LOCAL_AGENT_URL ?? 'http://127.0.0.1:3456';
const apiUrl = process.env.VITE_API_URL ?? 'http://localhost:3000';
const terminalId = process.env.VITE_TERMINAL_ID ?? '00000000-0000-4000-8000-000000000001';
const terminalSecret = process.env.VITE_TERMINAL_SECRET ?? 'dev-terminal-secret';

async function agentFetch(path, options = {}) {
  const method = options.method ?? 'GET';
  const needsBody = method !== 'GET' && method !== 'HEAD' && options.body == null;
  const res = await fetch(`${agentUrl}${path}`, {
    headers: { 'content-type': 'application/json', ...options.headers },
    ...options,
    ...(needsBody ? { body: '{}' } : {}),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
  return res.json();
}

contextBridge.exposeInMainWorld('venuePos', {
  getAgentHealth: () => agentFetch('/health'),
  getMenu: () => agentFetch('/v1/menu'),
  syncMenu: () => agentFetch('/v1/menu/sync', { method: 'POST' }),
  createOrder: (body) =>
    agentFetch('/v1/orders', { method: 'POST', body: JSON.stringify(body) }),
  updateOrder: (orderId, body) =>
    agentFetch(`/v1/orders/${orderId}`, { method: 'PATCH', body: JSON.stringify(body) }),
  addOrderItem: (orderId, body) =>
    agentFetch(`/v1/orders/${orderId}/items`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateOrderItem: (orderId, itemId, quantity) =>
    agentFetch(`/v1/orders/${orderId}/items/${itemId}`, {
      method: 'PATCH',
      body: JSON.stringify({ quantity }),
    }),
  removeOrderItem: (orderId, itemId) =>
    agentFetch(`/v1/orders/${orderId}/items/${itemId}`, { method: 'DELETE' }),
  sendOrder: (orderId) =>
    agentFetch(`/v1/orders/${orderId}/send`, { method: 'POST' }),
  abandonDraft: (orderId) =>
    agentFetch(`/v1/orders/${orderId}/abandon`, { method: 'POST' }),
  getReceipt: (orderId) => agentFetch(`/v1/orders/${orderId}/receipt`),
  openCheque: (body) =>
    agentFetch('/v1/cheques/open', { method: 'POST', body: JSON.stringify(body) }),
  fireCheque: (chequeId) =>
    agentFetch(`/v1/cheques/${chequeId}/fire`, { method: 'POST' }),
  clearCheque: (chequeId) =>
    agentFetch(`/v1/cheques/${chequeId}/clear`, { method: 'POST' }),
  payCheque: (chequeId, body) =>
    agentFetch(`/v1/cheques/${chequeId}/pay`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  loginPin: async (pin) => {
    const res = await fetch(`${apiUrl}/api/v1/auth/pin`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-terminal-id': terminalId,
        'x-terminal-secret': terminalSecret,
      },
      body: JSON.stringify({ pin }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message ?? 'PIN failed');
    return data;
  },
  platform: process.platform,
  onItemStatusChange(handler) {
    const socket = ensurePosSocket();
    const listener = (msg) => handler(msg?.payload ?? msg);
    socket.on('order:item_status', listener);
    return () => socket.off('order:item_status', listener);
  },
});
