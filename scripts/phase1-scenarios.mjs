/**
 * Phase 1 user-scenario smoke tests (API + local-agent).
 * Run with API and local-agent dev servers up.
 */
const API = 'http://localhost:3000';
const AGENT = 'http://127.0.0.1:3456';
const TERMINAL_ID = '00000000-0000-4000-8000-000000000001';
const TERMINAL_SECRET = 'dev-terminal-secret';
const VENUE_ID = '00000000-0000-4000-8000-000000000010';
const CASHIER_ID = '00000000-0000-4000-8000-000000000011';

const terminalHeaders = {
  'content-type': 'application/json',
  'x-terminal-id': TERMINAL_ID,
  'x-terminal-secret': TERMINAL_SECRET,
};

let passed = 0;
let failed = 0;

function ok(name) {
  passed++;
  console.log(`  ✓ ${name}`);
}

function fail(name, detail) {
  failed++;
  console.error(`  ✗ ${name}: ${detail}`);
}

async function api(path, options = {}) {
  const res = await fetch(`${API}${path}`, options);
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { res, body };
}

async function agent(path, options = {}) {
  const res = await fetch(`${AGENT}${path}`, {
    headers: { 'content-type': 'application/json', ...options.headers },
    ...options,
  });
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { res, body };
}

async function run() {
  console.log('Phase 1 user scenarios\n');

  // Scenario 1: Bad PIN rejected
  {
    const { res } = await api('/api/v1/auth/pin', {
      method: 'POST',
      headers: terminalHeaders,
      body: JSON.stringify({ pin: '9999' }),
    });
    if (res.status === 401) ok('Cashier: wrong PIN rejected');
    else fail('Cashier: wrong PIN rejected', `status ${res.status}`);
  }

  // Scenario 2: Valid PIN login
  let cashierUserId;
  {
    const { res, body } = await api('/api/v1/auth/pin', {
      method: 'POST',
      headers: terminalHeaders,
      body: JSON.stringify({ pin: '1234' }),
    });
    if (res.ok && body.user?.role === 'cashier') {
      cashierUserId = body.user.id;
      ok('Cashier: PIN 1234 login succeeds');
    } else fail('Cashier: PIN login', JSON.stringify(body));
  }

  // Scenario 3: Manager login + list menus
  let managerToken;
  {
    const { res, body } = await api('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'admin123' }),
    });
    if (res.ok && body.accessToken) {
      managerToken = body.accessToken;
      ok('Manager: dashboard login succeeds');
    } else fail('Manager login', JSON.stringify(body));
  }

  {
    const { res, body } = await api('/api/v1/menu-templates', {
      headers: { authorization: `Bearer ${managerToken}` },
    });
    const list = Array.isArray(body) ? body : body.templates;
    if (res.ok && Array.isArray(list) && list.length > 0) {
      ok('Manager: menu templates listed in dashboard');
    } else fail('Manager menu list', JSON.stringify(body));
  }

  // Scenario 4: Terminal fetches published menu
  let cappuccino;
  let sizeOption;
  {
    const { res, body } = await api(`/api/v1/venues/${VENUE_ID}/menu`, {
      headers: terminalHeaders,
    });
    if (!res.ok) {
      fail('Terminal: fetch venue menu', JSON.stringify(body));
    } else {
      const items = body.categories?.flatMap((c) => c.items) ?? [];
      cappuccino = items.find((i) => i.nameEn === 'Cappuccino');
      const modGroup = cappuccino?.modifierGroups?.[0];
      sizeOption = modGroup?.options?.find((o) => o.nameEn === 'Large');
      if (cappuccino && sizeOption) ok('Terminal: published menu has Cappuccino + size modifier');
      else fail('Terminal menu', 'Cappuccino or size modifier missing');
    }
  }

  // Scenario 5: Local agent menu sync
  {
    const { res, body } = await agent('/v1/menu/sync', { method: 'POST', body: '{}' });
    const hash = body.versionHash ?? body.menu?.versionHash;
    if (res.ok && hash) ok('Agent: menu sync from server');
    else fail('Agent menu sync', JSON.stringify(body));
  }

  {
    const { res, body } = await agent('/v1/menu');
    if (res.ok && body.categories?.length > 0) ok('Agent: cached menu available for POS');
    else fail('Agent cached menu', JSON.stringify(body));
  }

  // Scenario 6: Create order via agent (POS flow)
  let orderId;
  {
    const { res, body } = await agent('/v1/orders', {
      method: 'POST',
      body: JSON.stringify({ cashierId: cashierUserId ?? CASHIER_ID, tableLabel: 'T5' }),
    });
    if (res.ok && body.id) {
      orderId = body.id;
      ok('POS: new draft order created via agent');
    } else fail('POS new order', JSON.stringify(body));
  }

  // Scenario 7: Add item with modifier
  let itemId;
  {
    const modifiers = [
      {
        groupId: cappuccino.modifierGroups[0].id,
        optionId: sizeOption.id,
        nameEn: sizeOption.nameEn,
        nameAr: sizeOption.nameAr,
        priceDelta: Number(sizeOption.priceDelta),
      },
    ];
    const unitPrice = Number(cappuccino.price);
    const expected = unitPrice + Number(sizeOption.priceDelta);
    const { res, body } = await agent(`/v1/orders/${orderId}/items`, {
      method: 'POST',
      body: JSON.stringify({
        menuItemId: cappuccino.id,
        quantity: 1,
        nameEn: cappuccino.nameEn,
        nameAr: cappuccino.nameAr,
        unitPrice,
        modifiers,
      }),
    });
    if (res.ok && body.items?.length === 1) {
      itemId = body.items[0].id;
      if (Math.abs(body.subtotal - expected) < 0.01) {
        ok('POS: add Cappuccino Large with correct subtotal');
      } else {
        fail('POS subtotal', `expected ${expected}, got ${body.subtotal}`);
      }
    } else fail('POS add item', JSON.stringify(body));
  }

  // Scenario 8: Qty update
  {
    const { res, body } = await agent(`/v1/orders/${orderId}/items/${itemId}`, {
      method: 'PATCH',
      body: JSON.stringify({ quantity: 2 }),
    });
    if (res.ok && body.items[0].quantity === 2) ok('POS: quantity increased to 2');
    else fail('POS qty update', JSON.stringify(body));
  }

  // Scenario 9: Send to kitchen
  {
    const { res, body } = await agent(`/v1/orders/${orderId}/send`, { method: 'POST', body: '{}' });
    if (res.ok && (body.status === 'sent' || body.server?.status === 'sent')) {
      ok('POS: send to kitchen locks order');
    } else fail('POS send kitchen', JSON.stringify(body));
  }

  // Scenario 10: Cannot add items after send
  {
    const { res } = await api(`/api/v1/orders/${orderId}/items`, {
      method: 'POST',
      headers: terminalHeaders,
      body: JSON.stringify({ menuItemId: cappuccino.id, quantity: 1 }),
    });
    if (res.status === 400) ok('POS: add item blocked after send');
    else fail('Post-send add', `expected 400, got ${res.status}`);
  }

  // Scenario 11: Receipt
  {
    const { res, body } = await agent(`/v1/orders/${orderId}/receipt`);
    if (res.ok && (body.text || body.lines)) ok('POS: receipt generated');
    else fail('POS receipt', JSON.stringify(body));
  }

  // Scenario 12: Manager 86 item
  if (cappuccino) {
    const { res, body } = await api(`/api/v1/menu-items/${cappuccino.id}`, {
      method: 'PATCH',
      headers: {
        authorization: `Bearer ${managerToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ isAvailable: false }),
    });
    const item = body.categories?.flatMap((c) => c.items)?.find((i) => i.id === cappuccino.id);
    if (res.ok && item?.isAvailable === false) ok('Manager: 86 item toggled off');
    else fail('Manager 86', JSON.stringify(body));

    // Restore
    await api(`/api/v1/menu-items/${cappuccino.id}`, {
      method: 'PATCH',
      headers: {
        authorization: `Bearer ${managerToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ isAvailable: true }),
    });
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
