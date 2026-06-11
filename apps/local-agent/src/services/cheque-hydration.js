import { apiFetch } from './api-fetch.js';

function chequeHasPendingSync(db, chequeId) {
  const rows = db.prepare(`SELECT payload_json FROM sync_queue WHERE status = 'pending'`).all();
  return rows.some((row) => {
    try {
      const payload = JSON.parse(row.payload_json);
      return payload.chequeId === chequeId;
    } catch {
      return false;
    }
  });
}

function upsertOrderWithItems(db, order, cheque) {
  if (!order?.id) return;
  const existing = db.prepare(`SELECT id FROM orders WHERE id = ?`).get(order.id);
  const openedAt = order.openedAt ?? cheque.openedAt ?? new Date().toISOString();
  if (!existing) {
    db.prepare(
      `INSERT INTO orders (id, server_id, cheque_id, venue_id, cashier_id, terminal_id, order_number, table_label, status, opened_at, synced_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    ).run(
      order.id,
      order.id,
      cheque.id,
      cheque.venueId,
      order.cashierId ?? cheque.cashierId,
      order.terminalId ?? cheque.terminalId ?? null,
      order.orderNumber ?? null,
      order.tableLabel ?? cheque.tableLabel ?? null,
      order.status ?? 'draft',
      openedAt,
    );
  } else {
    db.prepare(
      `UPDATE orders SET cheque_id = ?, status = ?, order_number = ?, synced_at = datetime('now') WHERE id = ?`,
    ).run(cheque.id, order.status ?? 'draft', order.orderNumber ?? null, order.id);
  }

  db.prepare(`DELETE FROM order_items WHERE order_id = ?`).run(order.id);
  for (const item of order.items ?? []) {
    db.prepare(
      `INSERT INTO order_items (id, order_id, menu_item_id, quantity, unit_price, name_en, name_ar, modifiers_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      item.id ?? `${order.id}-${item.menuItemId}`,
      order.id,
      item.menuItemId,
      item.quantity,
      item.unitPrice,
      item.nameEn ?? item.name_en ?? '',
      item.nameAr ?? item.name_ar ?? '',
      item.modifiersSnapshot?.length ? JSON.stringify(item.modifiersSnapshot) : null,
    );
  }
}

function upsertChequeFromServer(db, cheque) {
  const existing = db.prepare(`SELECT id FROM cheques WHERE id = ?`).get(cheque.id);
  const discount = Number(cheque.discountAmount ?? 0);
  const tax = Number(cheque.taxAmount ?? 0);
  const service = Number(cheque.serviceAmount ?? 0);
  const total = Number(cheque.total ?? 0);
  const openedAt = cheque.openedAt ?? new Date().toISOString();

  if (!existing) {
    db.prepare(
      `INSERT INTO cheques (id, server_id, venue_id, cashier_id, terminal_id, table_label, floor_table_id, service_mode, cheque_number, status, pre_payment_check_print_count, discount_amount, tax_amount, service_amount, total, opened_at, synced_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    ).run(
      cheque.id,
      cheque.id,
      cheque.venueId,
      cheque.cashierId,
      cheque.terminalId ?? null,
      cheque.tableLabel,
      cheque.floorTableId ?? null,
      cheque.serviceMode ?? 'dine_in',
      cheque.chequeNumber ?? null,
      cheque.status ?? 'open',
      cheque.prePaymentCheckPrintCount ?? 0,
      discount,
      tax,
      service,
      total,
      openedAt,
    );
  } else {
    db.prepare(
      `UPDATE cheques SET server_id = ?, venue_id = ?, cashier_id = ?, terminal_id = ?, table_label = ?, floor_table_id = ?, service_mode = ?, cheque_number = ?, status = ?, pre_payment_check_print_count = ?, discount_amount = ?, tax_amount = ?, service_amount = ?, total = ?, opened_at = ?, synced_at = datetime('now') WHERE id = ?`,
    ).run(
      cheque.id,
      cheque.venueId,
      cheque.cashierId,
      cheque.terminalId ?? null,
      cheque.tableLabel,
      cheque.floorTableId ?? null,
      cheque.serviceMode ?? 'dine_in',
      cheque.chequeNumber ?? null,
      cheque.status ?? 'open',
      cheque.prePaymentCheckPrintCount ?? 0,
      discount,
      tax,
      service,
      total,
      openedAt,
      cheque.id,
    );
  }

  const orders = [...(cheque.orders ?? [])];
  if (cheque.draftOrder && !orders.some((o) => o.id === cheque.draftOrder.id)) {
    orders.push(cheque.draftOrder);
  }
  for (const order of orders) {
    upsertOrderWithItems(db, order, cheque);
  }
}

function pruneStaleMirroredCheques(db, venueId, activeServerIds) {
  const mirrored = db
    .prepare(
      `SELECT id FROM cheques WHERE venue_id = ? AND status = 'open' AND server_id IS NOT NULL AND server_id = id`,
    )
    .all(venueId);
  for (const row of mirrored) {
    if (activeServerIds.has(row.id)) continue;
    if (chequeHasPendingSync(db, row.id)) continue;
    const orderIds = db.prepare(`SELECT id FROM orders WHERE cheque_id = ?`).all(row.id).map((o) => o.id);
    for (const orderId of orderIds) {
      db.prepare(`DELETE FROM order_items WHERE order_id = ?`).run(orderId);
    }
    db.prepare(`DELETE FROM orders WHERE cheque_id = ?`).run(row.id);
    db.prepare(`DELETE FROM cheques WHERE id = ?`).run(row.id);
  }
}

/** Mirror all venue open cheques from cloud into local SQLite while online. */
export async function hydrateOpenCheques({ db, apiUrl, venueId, terminalId, terminalSecret }) {
  const cheques = await apiFetch(apiUrl, terminalId, terminalSecret, '/api/v1/cheques/open');
  const list = Array.isArray(cheques) ? cheques : [];
  const activeServerIds = new Set();

  const run = db.transaction(() => {
    for (const cheque of list) {
      if (!cheque?.id || cheque.status !== 'open') continue;
      if (chequeHasPendingSync(db, cheque.id)) continue;
      upsertChequeFromServer(db, cheque);
      activeServerIds.add(cheque.id);
    }
    pruneStaleMirroredCheques(db, venueId, activeServerIds);
  });
  run();

  return { hydrated: activeServerIds.size };
}
