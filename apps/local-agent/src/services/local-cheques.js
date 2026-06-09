import { randomUUID } from 'node:crypto';
import { getLocalOrder, sendLocalOrder } from './orders.js';

function nextLocalChequeNumber(db, venueId) {
  const row = db
    .prepare(`SELECT MAX(cheque_number) AS n FROM cheques WHERE venue_id = ?`)
    .get(venueId);
  return (row?.n ?? 0) + 1;
}

function computeChequeTotals(db, chequeId) {
  const orders = db
    .prepare(`SELECT id, status FROM orders WHERE cheque_id = ? ORDER BY opened_at ASC`)
    .all(chequeId);
  let subtotal = 0;
  const serializedOrders = [];
  let draftOrder = null;

  for (const o of orders) {
    const order = getLocalOrder(db, o.id);
    if (!order) continue;
    serializedOrders.push(order);
    if (order.status === 'draft') {
      draftOrder = order;
      subtotal += order.subtotal;
    } else if (['sent', 'ready', 'served', 'closed', 'billed'].includes(order.status)) {
      subtotal += order.subtotal;
    }
  }

  const cheque = db.prepare(`SELECT * FROM cheques WHERE id = ?`).get(chequeId);
  const discount = Number(cheque?.discount_amount ?? 0);
  const tax = Number(cheque?.tax_amount ?? 0);
  const service = Number(cheque?.service_amount ?? 0);
  const total = Math.max(0, subtotal - discount + tax + service);

  return { subtotal, discount, tax, service, total, orders: serializedOrders, draftOrder };
}

export function serializeLocalCheque(db, chequeId) {
  const cheque = db.prepare(`SELECT * FROM cheques WHERE id = ?`).get(chequeId);
  if (!cheque) return null;

  const totals = computeChequeTotals(db, chequeId);
  return {
    id: cheque.id,
    serverId: cheque.server_id,
    venueId: cheque.venue_id,
    terminalId: cheque.terminal_id,
    cashierId: cheque.cashier_id,
    chequeNumber: cheque.cheque_number,
    tableLabel: cheque.table_label,
    status: cheque.status,
    discountAmount: totals.discount,
    subtotalBeforeDiscount: totals.subtotal,
    serviceAmount: totals.service,
    taxAmount: totals.tax,
    total: cheque.status === 'paid' ? Number(cheque.total) : totals.total,
    parentChequeId: null,
    splitLabel: null,
    orders: totals.orders,
    draftOrder: totals.draftOrder,
    openedAt: cheque.opened_at,
    closedAt: cheque.closed_at,
    offline: !cheque.server_id,
  };
}

export function openLocalCheque(db, { id, venueId, terminalId, cashierId, tableLabel }) {
  const trimmed = tableLabel?.trim();
  if (!trimmed) throw new Error('tableLabel required');

  const existing = db
    .prepare(
      `SELECT id FROM cheques WHERE venue_id = ? AND table_label = ? AND status = 'open' LIMIT 1`,
    )
    .get(venueId, trimmed);
  if (existing) return serializeLocalCheque(db, existing.id);

  const chequeId = id ?? randomUUID();
  const orderId = randomUUID();
  const now = new Date().toISOString();
  const chequeNumber = nextLocalChequeNumber(db, venueId);

  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO cheques (id, venue_id, cashier_id, terminal_id, table_label, cheque_number, status, opened_at)
       VALUES (?, ?, ?, ?, ?, ?, 'open', ?)`,
    ).run(chequeId, venueId, cashierId, terminalId ?? null, trimmed, chequeNumber, now);

    db.prepare(
      `INSERT INTO orders (id, cheque_id, venue_id, cashier_id, terminal_id, table_label, status, opened_at)
       VALUES (?, ?, ?, ?, ?, ?, 'draft', ?)`,
    ).run(orderId, chequeId, venueId, cashierId, terminalId ?? null, trimmed, now);
  });
  tx();

  return serializeLocalCheque(db, chequeId);
}

export function listLocalOpenCheques(db, venueId) {
  const rows = db
    .prepare(`SELECT id FROM cheques WHERE venue_id = ? AND status = 'open' ORDER BY opened_at ASC`)
    .all(venueId);
  return rows.map((r) => serializeLocalCheque(db, r.id)).filter(Boolean);
}

export function getLocalChequeById(db, chequeId) {
  return serializeLocalCheque(db, chequeId);
}

export function fireLocalCheque(db, chequeId) {
  const cheque = db.prepare(`SELECT * FROM cheques WHERE id = ?`).get(chequeId);
  if (!cheque) throw new Error('Cheque not found');
  if (cheque.status !== 'open') throw new Error('Cheque is not open');

  const draft = db
    .prepare(`SELECT id FROM orders WHERE cheque_id = ? AND status = 'draft' LIMIT 1`)
    .get(chequeId);
  let sentOrder = null;
  if (draft) {
    const order = getLocalOrder(db, draft.id);
    if (order?.items?.length) {
      sentOrder = sendLocalOrder(db, draft.id);
    }
  }

  return { cheque: serializeLocalCheque(db, chequeId), sentOrder };
}

export function payLocalCheque(db, chequeId, { payments, method, amount }) {
  const cheque = db.prepare(`SELECT * FROM cheques WHERE id = ?`).get(chequeId);
  if (!cheque) throw new Error('Cheque not found');
  if (cheque.status !== 'open') throw new Error('Cheque is not open');

  const totals = computeChequeTotals(db, chequeId);
  const total = totals.total;
  const lines =
    payments?.length > 0
      ? payments
      : [{ method: method ?? 'cash', amount: amount != null ? Number(amount) : total }];

  const sum = lines.reduce((s, p) => s + Number(p.amount), 0);
  if (Math.abs(sum - total) > 0.02) throw new Error('Payment total must match cheque total');

  const now = new Date().toISOString();
  db.prepare(
    `UPDATE cheques SET status = 'paid', total = ?, closed_at = ? WHERE id = ?`,
  ).run(total, now, chequeId);

  return {
    cheque: serializeLocalCheque(db, chequeId),
    payments: lines,
    receipt: `OFFLINE RECEIPT\nTable ${cheque.table_label}\nTotal ${total.toFixed(2)}`,
  };
}

export function linkOrderToCheque(db, orderId, chequeId) {
  db.prepare(`UPDATE orders SET cheque_id = ? WHERE id = ?`).run(chequeId, orderId);
}
