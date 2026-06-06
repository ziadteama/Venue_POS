import { randomUUID } from 'node:crypto';
import { apiFetch } from './api-fetch.js';

export function createLocalOrder(db, { venueId, cashierId, terminalId, tableLabel }) {
  const id = randomUUID();
  const openedAt = new Date().toISOString();

  db.prepare(
    `INSERT INTO orders (id, venue_id, cashier_id, terminal_id, table_label, status, opened_at)
     VALUES (?, ?, ?, ?, ?, 'draft', ?)`,
  ).run(id, venueId, cashierId, terminalId ?? null, tableLabel ?? null, openedAt);

  return getLocalOrder(db, id);
}

export function addLocalOrderItem(
  db,
  orderId,
  { menuItemId, quantity, nameEn, nameAr, unitPrice, modifiers = [] },
) {
  const order = db.prepare('SELECT id, status FROM orders WHERE id = ?').get(orderId);
  if (!order) throw new Error('Order not found');
  if (order.status !== 'draft') throw new Error('Order is not editable');

  const modKey = JSON.stringify(modifiers);
  const items = db
    .prepare('SELECT * FROM order_items WHERE order_id = ? AND menu_item_id = ?')
    .all(orderId, menuItemId);
  const existing = items.find((row) => (row.modifiers_json ?? '[]') === modKey);

  if (existing) {
    db.prepare('UPDATE order_items SET quantity = ? WHERE id = ?').run(
      existing.quantity + quantity,
      existing.id,
    );
  } else {
    db.prepare(
      `INSERT INTO order_items (id, order_id, menu_item_id, quantity, unit_price, name_en, name_ar, modifiers_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      randomUUID(),
      orderId,
      menuItemId,
      quantity,
      unitPrice,
      nameEn,
      nameAr,
      modifiers.length ? modKey : null,
    );
  }

  return getLocalOrder(db, orderId);
}

export function updateLocalOrderItemQty(db, orderId, itemId, quantity) {
  const order = db.prepare('SELECT status FROM orders WHERE id = ?').get(orderId);
  if (!order || order.status !== 'draft') throw new Error('Order is not editable');

  if (quantity <= 0) {
    db.prepare('DELETE FROM order_items WHERE id = ? AND order_id = ?').run(itemId, orderId);
  } else {
    db.prepare('UPDATE order_items SET quantity = ? WHERE id = ? AND order_id = ?').run(
      quantity,
      itemId,
      orderId,
    );
  }
  return getLocalOrder(db, orderId);
}

export function sendLocalOrder(db, orderId) {
  const order = getLocalOrder(db, orderId);
  if (!order) throw new Error('Order not found');
  if (order.status !== 'draft') throw new Error('Order already sent');
  if (!order.items.length) throw new Error('Cannot send empty order');

  db.prepare(`UPDATE orders SET status = 'sent' WHERE id = ?`).run(orderId);
  return getLocalOrder(db, orderId);
}

export function getLocalOrder(db, orderId) {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  if (!order) return null;

  const items = db
    .prepare('SELECT * FROM order_items WHERE order_id = ? ORDER BY created_at ASC')
    .all(orderId);

  const subtotal = items.reduce((sum, item) => {
    const mods = item.modifiers_json ? JSON.parse(item.modifiers_json) : [];
    const modTotal = mods.reduce((m, mod) => m + Number(mod.priceDelta ?? 0), 0);
    return sum + (item.unit_price + modTotal) * item.quantity;
  }, 0);

  return {
    id: order.id,
    serverId: order.server_id,
    venueId: order.venue_id,
    cashierId: order.cashier_id,
    terminalId: order.terminal_id,
    orderNumber: order.order_number,
    tableLabel: order.table_label,
    status: order.status,
    openedAt: order.opened_at,
    items: items.map((item) => ({
      id: item.id,
      menuItemId: item.menu_item_id,
      quantity: item.quantity,
      unitPrice: item.unit_price,
      nameEn: item.name_en,
      nameAr: item.name_ar,
      modifiersSnapshot: item.modifiers_json ? JSON.parse(item.modifiers_json) : [],
    })),
    subtotal,
  };
}

export async function pushOrderToServer({
  db,
  apiUrl,
  terminalId,
  terminalSecret,
  orderId,
  cashierId,
}) {
  const order = getLocalOrder(db, orderId);
  if (!order) throw new Error('Order not found');

  const serverOrder = await apiFetch(apiUrl, terminalId, terminalSecret, '/api/v1/orders', {
    method: 'POST',
    body: JSON.stringify({
      id: orderId,
      cashierId,
      tableLabel: order.tableLabel,
    }),
  });

  db.prepare(
    `UPDATE orders SET server_id = ?, order_number = ?, synced_at = datetime('now') WHERE id = ?`,
  ).run(serverOrder.id, serverOrder.orderNumber, orderId);

  for (const item of order.items) {
    await apiFetch(apiUrl, terminalId, terminalSecret, `/api/v1/orders/${orderId}/items`, {
      method: 'POST',
      body: JSON.stringify({
        menuItemId: item.menuItemId,
        quantity: item.quantity,
        modifiers: item.modifiersSnapshot,
      }),
    });
  }

  return serverOrder;
}

export async function syncOrderAction({
  db,
  apiUrl,
  terminalId,
  terminalSecret,
  orderId,
  action,
  body,
}) {
  const order = getLocalOrder(db, orderId);
  if (!order) throw new Error('Order not found');

  if (action === 'send') {
    const result = await apiFetch(
      apiUrl,
      terminalId,
      terminalSecret,
      `/api/v1/orders/${orderId}/send`,
      { method: 'POST' },
    );
    db.prepare(`UPDATE orders SET status = 'sent', order_number = ? WHERE id = ?`).run(
      result.orderNumber ?? order.orderNumber,
      orderId,
    );
    return result;
  }

  if (action === 'patch-item') {
    return apiFetch(
      apiUrl,
      terminalId,
      terminalSecret,
      `/api/v1/orders/${orderId}/items/${body.itemId}`,
      { method: 'PATCH', body: JSON.stringify({ quantity: body.quantity }) },
    );
  }

  if (action === 'receipt') {
    return apiFetch(apiUrl, terminalId, terminalSecret, `/api/v1/orders/${orderId}/receipt`);
  }

  throw new Error(`Unknown action ${action}`);
}
