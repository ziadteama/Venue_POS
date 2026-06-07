import { AGENT_URL } from '../config.js';

function parseAgentError(body) {
  if (!body) return 'Request failed';
  const pinMsg = body.match(/Invalid (?:venue )?manager PIN/i)?.[0];
  if (pinMsg) return pinMsg;

  const apiMessages = [...body.matchAll(/"message":"([^"\\]+)"/g)].map((m) => m[1]);
  const friendly = apiMessages.find((m) => !m.startsWith('API /api/'));
  if (friendly) return friendly;

  try {
    const json = JSON.parse(body);
    if (json.error?.message) return json.error.message;
    if (typeof json.message === 'string' && !json.message.startsWith('API /api/')) {
      return json.message;
    }
  } catch {
    // plain-text error from agent
  }

  return body.length > 120 ? `${body.slice(0, 120)}…` : body;
}

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
    if (path.match(/^\/v1\/cheques\/[^/]+$/) && method === 'DELETE') {
      return window.venuePos.deleteCheque(path.split('/')[3]);
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
    if (path.startsWith('/v1/shifts/active') && method === 'GET') {
      const cashierId = new URL(path, 'http://local').searchParams.get('cashierId');
      return window.venuePos.getShiftActive(cashierId);
    }
    if (path.startsWith('/v1/shifts/open-context') && method === 'GET') {
      const cashierId = new URL(path, 'http://local').searchParams.get('cashierId');
      return window.venuePos.getShiftOpenContext(cashierId);
    }
    if (path === '/v1/shifts/open' && method === 'POST') {
      return window.venuePos.openShift(body);
    }
    if (path === '/v1/shifts/close' && method === 'POST') {
      return window.venuePos.closeShift(body);
    }
    if (path.match(/^\/v1\/cheques\/[^/]+\/discount$/) && method === 'POST') {
      return window.venuePos.discountCheque(path.split('/')[3], body);
    }
    if (path.match(/^\/v1\/cheques\/[^/]+\/discount$/) && method === 'PATCH') {
      return window.venuePos.changeChequeDiscount(path.split('/')[3], body);
    }
    if (path.match(/^\/v1\/cheques\/[^/]+\/discount\/remove$/) && method === 'POST') {
      return window.venuePos.removeChequeDiscount(path.split('/')[3], body);
    }
    if (path.match(/^\/v1\/cheques\/[^/]+\/refund$/) && method === 'POST') {
      return window.venuePos.refundCheque(path.split('/')[3], body);
    }
  }

  const needsBody = method !== 'GET' && method !== 'HEAD' && options.body == null;
  const res = await fetch(`${AGENT_URL}${path}`, {
    headers: { 'content-type': 'application/json', ...options.headers },
    ...options,
    ...(needsBody ? { body: '{}' } : {}),
  });
  if (!res.ok) throw new Error(parseAgentError(await res.text()));
  return res.json();
}
