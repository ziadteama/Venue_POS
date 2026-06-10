import { randomUUID } from 'node:crypto';
import { getLocalOrder, sendLocalOrder, createLocalOrder } from './orders.js';

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
    const billableItems = order.items.filter(
      (item) => !item.billingChequeId || item.billingChequeId === chequeId,
    );
    const orderSubtotal = billableItems.reduce((sum, item) => {
      const modTotal = (item.modifiersSnapshot ?? []).reduce(
        (m, mod) => m + Number(mod.priceDelta ?? 0),
        0,
      );
      return sum + (item.unitPrice + modTotal) * item.quantity;
    }, 0);
    const filtered = { ...order, items: billableItems, subtotal: orderSubtotal };
    serializedOrders.push(filtered);
    if (order.status === 'draft') {
      draftOrder = filtered;
      subtotal += orderSubtotal;
    } else if (['sent', 'ready', 'served', 'closed', 'billed'].includes(order.status)) {
      subtotal += orderSubtotal;
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
    parentChequeId: cheque.parent_cheque_id ?? null,
    splitLabel: cheque.split_label ?? null,
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

  const draftRow = db
    .prepare(`SELECT id FROM orders WHERE cheque_id = ? AND status = 'draft' LIMIT 1`)
    .get(chequeId);
  let sentOrder = null;
  if (draftRow) {
    const order = getLocalOrder(db, draftRow.id);
    if (order?.items?.length) {
      sentOrder = sendLocalOrder(db, draftRow.id);
      const nextDraft = createLocalOrder(db, {
        venueId: cheque.venue_id,
        cashierId: cheque.cashier_id,
        terminalId: cheque.terminal_id,
        tableLabel: cheque.table_label,
      });
      db.prepare(`UPDATE orders SET cheque_id = ? WHERE id = ?`).run(chequeId, nextDraft.id);
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

export function applyLocalChequeDiscount(db, chequeId, { amount, percent }) {
  const cheque = db.prepare(`SELECT * FROM cheques WHERE id = ?`).get(chequeId);
  if (!cheque || cheque.status !== 'open') throw new Error('Cheque is not open');

  const totals = computeChequeTotals(db, chequeId);
  let discount = 0;
  if (percent != null) {
    discount = Math.round(totals.subtotal * (Number(percent) / 100) * 100) / 100;
  } else if (amount != null) {
    discount = Number(amount);
  }
  discount = Math.min(discount, totals.subtotal);

  db.prepare(`UPDATE cheques SET discount_amount = ? WHERE id = ?`).run(discount, chequeId);
  return serializeLocalCheque(db, chequeId);
}

export function removeLocalChequeDiscount(db, chequeId) {
  db.prepare(`UPDATE cheques SET discount_amount = 0 WHERE id = ?`).run(chequeId);
  return serializeLocalCheque(db, chequeId);
}

export function listLocalPaidCheques(db, venueId, limit = 30) {
  const rows = db
    .prepare(
      `SELECT id FROM cheques WHERE venue_id = ? AND status = 'paid' ORDER BY closed_at DESC LIMIT ?`,
    )
    .all(venueId, limit);
  return rows.map((r) => serializeLocalCheque(db, r.id)).filter(Boolean);
}

function findDraftOrderRow(db, chequeId) {
  return db
    .prepare(`SELECT id FROM orders WHERE cheque_id = ? AND status = 'draft' LIMIT 1`)
    .get(chequeId);
}

function transferableItemRows(db, chequeId) {
  const orders = db
    .prepare(`SELECT id FROM orders WHERE cheque_id = ? AND status IN ('sent', 'ready', 'served')`)
    .all(chequeId);
  const items = [];
  for (const o of orders) {
    const rows = db
      .prepare(
        `SELECT * FROM order_items WHERE order_id = ? AND (billing_cheque_id IS NULL OR billing_cheque_id = ?)`,
      )
      .all(o.id, chequeId);
    for (const row of rows) {
      items.push({ ...row, orderId: o.id });
    }
  }
  return items;
}

export function clearLocalChequeDraft(db, chequeId) {
  const cheque = db.prepare(`SELECT * FROM cheques WHERE id = ?`).get(chequeId);
  if (!cheque || cheque.status !== 'open') throw new Error('Cheque is not open');

  const draft = findDraftOrderRow(db, chequeId);
  if (draft) {
    const order = getLocalOrder(db, draft.id);
    if (order?.items?.length) {
      db.prepare(`DELETE FROM order_items WHERE order_id = ?`).run(draft.id);
    }
  } else {
    createLocalOrder(db, {
      venueId: cheque.venue_id,
      cashierId: cheque.cashier_id,
      terminalId: cheque.terminal_id,
      tableLabel: cheque.table_label,
    });
  }
  return serializeLocalCheque(db, chequeId);
}

export function closeEmptyLocalCheque(db, chequeId, venueId) {
  const cheque = db.prepare(`SELECT * FROM cheques WHERE id = ?`).get(chequeId);
  if (!cheque || cheque.venue_id !== venueId) throw new Error('Cheque not found');
  if (cheque.status !== 'open') throw new Error('Cheque is not open');
  if (cheque.parent_cheque_id) throw new Error('Cannot remove a split sub-cheque');

  const draft = findDraftOrderRow(db, chequeId);
  if (draft) {
    const order = getLocalOrder(db, draft.id);
    if (order?.items?.length) throw new Error('Clear the current round before removing table');
  }
  if (transferableItemRows(db, chequeId).length > 0) {
    throw new Error('Cannot remove a table with fired items');
  }

  const child = db
    .prepare(`SELECT id FROM cheques WHERE parent_cheque_id = ? AND status = 'open' LIMIT 1`)
    .get(chequeId);
  if (child) throw new Error('Cannot remove a table with open split cheques');

  const tx = db.transaction(() => {
    const orders = db.prepare(`SELECT id FROM orders WHERE cheque_id = ?`).all(chequeId);
    for (const o of orders) {
      db.prepare(`DELETE FROM order_items WHERE order_id = ?`).run(o.id);
      db.prepare(`DELETE FROM orders WHERE id = ?`).run(o.id);
    }
    db.prepare(`DELETE FROM cheques WHERE id = ?`).run(chequeId);
  });
  tx();
  return { deleted: true, id: chequeId, tableLabel: cheque.table_label };
}

export function moveLocalChequeTable(db, chequeId, targetTableLabel, venueId) {
  const trimmed = targetTableLabel?.trim();
  if (!trimmed) throw new Error('Target table label is required');

  const cheque = db.prepare(`SELECT * FROM cheques WHERE id = ?`).get(chequeId);
  if (!cheque || cheque.venue_id !== venueId) throw new Error('Cheque not found');
  if (cheque.status !== 'open') throw new Error('Cheque is not open');
  if (cheque.parent_cheque_id) throw new Error('Cannot move a split sub-cheque');
  if (cheque.table_label === trimmed) return serializeLocalCheque(db, chequeId);

  const conflict = db
    .prepare(
      `SELECT id FROM cheques WHERE venue_id = ? AND table_label = ? AND status = 'open' AND id != ? LIMIT 1`,
    )
    .get(venueId, trimmed, chequeId);
  if (conflict) throw new Error('Another cheque is already open for that table');

  const oldLabel = cheque.table_label;
  db.prepare(`UPDATE cheques SET table_label = ? WHERE id = ?`).run(trimmed, chequeId);
  db.prepare(`UPDATE orders SET table_label = ? WHERE cheque_id = ?`).run(trimmed, chequeId);
  return { cheque: serializeLocalCheque(db, chequeId), oldTableLabel: oldLabel };
}

function ensureTargetLocalCheque(db, { venueId, terminalId, cashierId, tableLabel, sourceChequeId }) {
  const existing = db
    .prepare(
      `SELECT id FROM cheques WHERE venue_id = ? AND table_label = ? AND status = 'open' LIMIT 1`,
    )
    .get(venueId, tableLabel);
  if (existing && existing.id !== sourceChequeId) {
    return existing.id;
  }
  if (existing) return existing.id;

  const opened = openLocalCheque(db, {
    venueId,
    terminalId,
    cashierId,
    tableLabel,
  });
  return opened.id;
}

export function transferLocalChequeItems(
  db,
  sourceChequeId,
  { itemIds, targetChequeId, targetTableLabel, cashierId },
  venueId,
  terminalId,
) {
  const source = db.prepare(`SELECT * FROM cheques WHERE id = ?`).get(sourceChequeId);
  if (!source || source.venue_id !== venueId) throw new Error('Cheque not found');
  if (source.status !== 'open') throw new Error('Source cheque is not open');
  if (source.parent_cheque_id) throw new Error('Cannot transfer from a split sub-cheque');

  const draft = findDraftOrderRow(db, sourceChequeId);
  if (draft) {
    const order = getLocalOrder(db, draft.id);
    if (order?.items?.length) throw new Error('Send or clear the current round before transferring');
  }

  const allowed = transferableItemRows(db, sourceChequeId);
  const uniqueIds = [...new Set(itemIds ?? [])];
  for (const id of uniqueIds) {
    if (!allowed.some((i) => i.id === id)) throw new Error('Invalid or non-transferable item');
  }

  let targetId = targetChequeId;
  if (!targetId) {
    if (!targetTableLabel?.trim()) throw new Error('targetChequeId or targetTableLabel required');
    targetId = ensureTargetLocalCheque(db, {
      venueId,
      terminalId: terminalId ?? source.terminal_id,
      cashierId: cashierId ?? source.cashier_id,
      tableLabel: targetTableLabel.trim(),
      sourceChequeId,
    });
  }

  const target = db.prepare(`SELECT * FROM cheques WHERE id = ?`).get(targetId);
  if (!target || target.venue_id !== venueId) throw new Error('Target cheque not found');

  const tx = db.transaction(() => {
    let targetDraft = findDraftOrderRow(db, targetId);
    if (!targetDraft) {
      const created = createLocalOrder(db, {
        venueId,
        cashierId: cashierId ?? source.cashier_id,
        terminalId: terminalId ?? target.terminal_id,
        tableLabel: target.table_label,
      });
      db.prepare(`UPDATE orders SET cheque_id = ? WHERE id = ?`).run(targetId, created.id);
      targetDraft = { id: created.id };
    }

    const transferOrderId = randomUUID();
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO orders (id, cheque_id, venue_id, cashier_id, terminal_id, table_label, status, opened_at)
       VALUES (?, ?, ?, ?, ?, ?, 'sent', ?)`,
    ).run(
      transferOrderId,
      targetId,
      venueId,
      cashierId ?? source.cashier_id,
      terminalId ?? target.terminal_id,
      target.table_label,
      now,
    );

    for (const itemId of uniqueIds) {
      db.prepare(`UPDATE order_items SET order_id = ? WHERE id = ?`).run(transferOrderId, itemId);
    }
  });
  tx();

  return {
    source: serializeLocalCheque(db, sourceChequeId),
    target: serializeLocalCheque(db, targetId),
  };
}

export function splitLocalChequeByItems(db, chequeId, { splits }, venueId) {
  const cheque = db.prepare(`SELECT * FROM cheques WHERE id = ?`).get(chequeId);
  if (!cheque || cheque.venue_id !== venueId) throw new Error('Cheque not found');
  if (cheque.status !== 'open') throw new Error('Cheque is not open');
  if (cheque.parent_cheque_id) throw new Error('Cannot split a sub-cheque');

  const draft = findDraftOrderRow(db, chequeId);
  if (draft) {
    const order = getLocalOrder(db, draft.id);
    if (order?.items?.length) throw new Error('Send or clear the current round before splitting');
  }

  const allocatable = transferableItemRows(db, chequeId);
  const requested = new Set();
  for (const split of splits ?? []) {
    if (!split.label?.trim()) throw new Error('Each split needs a label');
    for (const itemId of split.itemIds ?? []) {
      if (requested.has(itemId)) throw new Error('An item cannot appear in multiple splits');
      requested.add(itemId);
      if (!allocatable.some((i) => i.id === itemId)) {
        throw new Error('Invalid or already allocated item');
      }
    }
  }

  const tx = db.transaction(() => {
    for (const split of splits) {
      const childId = randomUUID();
      const now = new Date().toISOString();
      const chequeNumber = nextLocalChequeNumber(db, venueId);
      db.prepare(
        `INSERT INTO cheques (id, venue_id, cashier_id, terminal_id, table_label, cheque_number, status, parent_cheque_id, split_label, opened_at)
         VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?, ?)`,
      ).run(
        childId,
        cheque.venue_id,
        cheque.cashier_id,
        cheque.terminal_id,
        cheque.table_label,
        chequeNumber,
        chequeId,
        split.label.trim(),
        now,
      );
      for (const itemId of split.itemIds) {
        db.prepare(`UPDATE order_items SET billing_cheque_id = ? WHERE id = ?`).run(childId, itemId);
      }
    }
  });
  tx();
  return serializeLocalCheque(db, chequeId);
}

export function buildLocalReceiptText(db, chequeId) {
  const cheque = serializeLocalCheque(db, chequeId);
  if (!cheque) return '';
  const lines = [`OFFLINE RECEIPT`, `Table ${cheque.tableLabel}`, `Total ${cheque.total.toFixed(2)}`];
  for (const order of cheque.orders) {
    for (const item of order.items) {
      lines.push(`${item.quantity}x ${item.nameEn}`);
    }
  }
  return lines.join('\n');
}
