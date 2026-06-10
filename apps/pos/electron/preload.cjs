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

function parseApiError(raw, fallback = 'Request failed') {
  if (!raw) return fallback;
  const text = String(raw);
  const pinMsg = text.match(/Invalid (?:venue |floor )?manager PIN[^"]*/i)?.[0];
  if (pinMsg) return pinMsg;
  const nestedMessages = [...text.matchAll(/"message"\s*:\s*"((?:\\.|[^"\\])*)"/g)].map((m) =>
    m[1].replace(/\\"/g, '"'),
  );
  const friendly = nestedMessages.find((m) => m && !m.startsWith('API /api/'));
  if (friendly) return friendly;
  try {
    const json = JSON.parse(text);
    if (json.error?.message) return json.error.message;
    if (typeof json.message === 'string' && !json.message.startsWith('API /api/')) {
      return json.message;
    }
  } catch {
    // ignore
  }
  const wrapped = text.match(/failed \(\d+\):\s*(\{[\s\S]+\})\s*$/)?.[1];
  if (wrapped) {
    try {
      const inner = JSON.parse(wrapped);
      if (inner.error?.message) return inner.error.message;
    } catch {
      // ignore
    }
  }
  return text.length > 160 ? `${text.slice(0, 160)}…` : text;
}

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
    throw new Error(parseApiError(text, text || res.statusText));
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
  listOpenCheques: () => agentFetch('/v1/cheques/open'),
  getCheque: (chequeId) => agentFetch(`/v1/cheques/${chequeId}`),
  deleteCheque: (chequeId) =>
    agentFetch(`/v1/cheques/${chequeId}`, { method: 'DELETE' }),
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
  printChequeReceipt: (chequeId, body) =>
    agentFetch(`/v1/cheques/${chequeId}/print-receipt`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  splitCheque: (chequeId, body) =>
    agentFetch(`/v1/cheques/${chequeId}/split`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  getShiftActive: (cashierId) =>
    agentFetch(`/v1/shifts/active?cashierId=${encodeURIComponent(cashierId)}`),
  getShiftOpenContext: (cashierId) =>
    agentFetch(`/v1/shifts/open-context?cashierId=${encodeURIComponent(cashierId)}`),
  openShift: (body) =>
    agentFetch('/v1/shifts/open', { method: 'POST', body: JSON.stringify(body) }),
  closeShift: (body) =>
    agentFetch('/v1/shifts/close', { method: 'POST', body: JSON.stringify(body) }),
  discountCheque: (chequeId, body) =>
    agentFetch(`/v1/cheques/${chequeId}/discount`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  changeChequeDiscount: (chequeId, body) =>
    agentFetch(`/v1/cheques/${chequeId}/discount`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  removeChequeDiscount: (chequeId, body) =>
    agentFetch(`/v1/cheques/${chequeId}/discount/remove`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  refundCheque: (chequeId, body) =>
    agentFetch(`/v1/cheques/${chequeId}/refund`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  loginPin: async (pin) => {
    const res = await fetch(`${agentUrl}/v1/auth/pin`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pin }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message ?? data.error ?? 'PIN failed');
    return data;
  },
  platform: process.platform,
  onItemStatusChange(handler) {
    const socket = ensurePosSocket();
    const listener = (msg) => handler(msg?.payload ?? msg);
    socket.on('order:item_status', listener);
    return () => socket.off('order:item_status', listener);
  },
  onFloorTableUpdated(handler) {
    const socket = ensurePosSocket();
    const listener = (msg) => handler(msg?.payload ?? msg);
    socket.on('floor:table_updated', listener);
    return () => socket.off('floor:table_updated', listener);
  },
  onHubTablesUpdated(handler) {
    const socket = ensurePosSocket();
    const listener = (msg) => handler(msg?.payload ?? msg);
    socket.on('hub:tables_updated', listener);
    return () => socket.off('hub:tables_updated', listener);
  },
  onManagerNotification(handler) {
    const socket = ensurePosSocket();
    const listener = (msg) => handler(msg?.payload ?? msg);
    socket.on('manager:notification', listener);
    return () => socket.off('manager:notification', listener);
  },
});
