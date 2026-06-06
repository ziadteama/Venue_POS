import { AGENT_URL } from '../config.js';

export async function callAgent(path, options = {}) {
  const method = options.method ?? 'GET';
  const body = options.body ? JSON.parse(options.body) : undefined;

  if (window.venuePos) {
    if (path === '/v1/menu' && method === 'GET') return window.venuePos.getMenu();
    if (path === '/v1/menu/sync') return window.venuePos.syncMenu();
    if (path === '/v1/orders' && method === 'POST') return window.venuePos.createOrder(body);
    if (path.match(/^\/v1\/orders\/[^/]+\/items$/) && method === 'POST') {
      return window.venuePos.addOrderItem(path.split('/')[3], body);
    }
    if (path.match(/^\/v1\/orders\/[^/]+\/items\/[^/]+$/) && method === 'PATCH') {
      const [, , , orderId, , itemId] = path.split('/');
      return window.venuePos.updateOrderItem(orderId, itemId, body.quantity);
    }
    if (path.match(/^\/v1\/orders\/[^/]+$/) && method === 'PATCH') {
      return window.venuePos.updateOrder(path.split('/')[3], body);
    }
    if (path.match(/^\/v1\/orders\/[^/]+\/abandon$/) && method === 'POST') {
      return window.venuePos.abandonDraft(path.split('/')[3]);
    }
    if (path.match(/^\/v1\/orders\/[^/]+\/send$/)) {
      return window.venuePos.sendOrder(path.split('/')[3]);
    }
    if (path.match(/^\/v1\/orders\/[^/]+\/receipt$/)) {
      return window.venuePos.getReceipt(path.split('/')[3]);
    }
    if (path === '/v1/cheques/open' && method === 'GET') return window.venuePos.listOpenCheques();
    if (path === '/v1/cheques/open' && method === 'POST') return window.venuePos.openCheque(body);
    if (path.match(/^\/v1\/cheques\/[^/]+$/) && method === 'GET') {
      return window.venuePos.getCheque(path.split('/')[3]);
    }
    if (path.match(/^\/v1\/cheques\/[^/]+\/fire$/) && method === 'POST') {
      return window.venuePos.fireCheque(path.split('/')[3]);
    }
    if (path.match(/^\/v1\/cheques\/[^/]+\/clear$/) && method === 'POST') {
      return window.venuePos.clearCheque(path.split('/')[3]);
    }
    if (path.match(/^\/v1\/cheques\/[^/]+\/pay$/) && method === 'POST') {
      return window.venuePos.payCheque(path.split('/')[3], body);
    }
    if (path.match(/^\/v1\/cheques\/[^/]+\/split$/) && method === 'POST') {
      return window.venuePos.splitCheque(path.split('/')[3], body);
    }
  }

  const needsBody = method !== 'GET' && method !== 'HEAD' && options.body == null;
  const res = await fetch(`${AGENT_URL}${path}`, {
    headers: { 'content-type': 'application/json', ...options.headers },
    ...options,
    ...(needsBody ? { body: '{}' } : {}),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
