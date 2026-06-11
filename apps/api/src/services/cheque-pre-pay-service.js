import { prisma } from '../db/prisma.js';
import { validationError } from '../utils/errors.js';
import { buildChequeReceiptText } from '../utils/serialize.js';
import { appendAuditLog } from './audit-log-service.js';
import {
  BILLABLE_ORDER_STATUSES,
  loadCheque,
  ordersFromCheque,
  serializeCheque,
} from './cheque-shared.js';
import { getCheque } from './cheque-lifecycle.js';
import { validateCashierForVenue } from './order-service.js';

function hasBillableLines(cheque) {
  return ordersFromCheque(cheque).some(
    (order) =>
      BILLABLE_ORDER_STATUSES.includes(order.status) &&
      order.items.some((item) => !item.isComped),
  );
}

async function resolveCashierActor(cashierId, venueId) {
  await validateCashierForVenue(cashierId, venueId);
  const cashier = await prisma.user.findUnique({
    where: { id: cashierId },
    select: { id: true, username: true },
  });
  return cashier;
}

export async function adjustPrePaymentItemQty(
  chequeId,
  orderId,
  itemId,
  quantity,
  { cashierId, terminalId },
  venueId,
) {
  if (!Number.isInteger(quantity) || quantity < 0) {
    throw validationError('Invalid quantity');
  }

  const cheque = await loadCheque(chequeId);
  if (cheque.venueId !== venueId) throw validationError('Cheque not found');
  if (cheque.status !== 'open') throw validationError('Only open cheques can be adjusted before payment');

  const order = ordersFromCheque(cheque).find((o) => o.id === orderId);
  if (!order) throw validationError('Order not on this cheque');
  if (!BILLABLE_ORDER_STATUSES.includes(order.status)) {
    throw validationError('Only fired rounds can be adjusted before payment');
  }

  const item = order.items.find((row) => row.id === itemId);
  if (!item) throw validationError('Order item not found');
  if (item.isComped) throw validationError('Comped items cannot be adjusted');
  if (item.billingChequeId && item.billingChequeId !== chequeId) {
    throw validationError('Item is billed on another cheque');
  }

  const previousQty = item.quantity;
  if (previousQty === quantity) {
    return getCheque(chequeId, venueId);
  }

  const cashier = await resolveCashierActor(cashierId, venueId);
  const itemName = item.menuItem?.nameEn ?? item.nameEn ?? 'Item';

  if (quantity <= 0) {
    await prisma.orderItem.delete({ where: { id: itemId } });
  } else {
    await prisma.orderItem.update({
      where: { id: itemId },
      data: { quantity },
    });
  }

  await appendAuditLog({
    venueId,
    actorId: cashier.id,
    actorUsername: cashier.username,
    action: 'check.pre_pay_adjust',
    entityType: 'cheque',
    entityId: chequeId,
    summary: `Pre-pay adjust #${cheque.chequeNumber}: ${itemName} ${previousQty} → ${quantity <= 0 ? 0 : quantity}`,
    details: {
      chequeNumber: cheque.chequeNumber,
      tableLabel: cheque.tableLabel,
      orderNumber: order.orderNumber,
      itemName,
      previousQty,
      newQty: quantity <= 0 ? 0 : quantity,
      terminalId: terminalId ?? null,
    },
  });

  return getCheque(chequeId, venueId);
}

export async function recordCheckPrint(chequeId, { cashierId, terminalId }, venueId) {
  const cheque = await loadCheque(chequeId);
  if (cheque.venueId !== venueId) throw validationError('Cheque not found');
  if (cheque.status !== 'open') throw validationError('Only open cheques can print a pre-payment check');
  if (!hasBillableLines(cheque)) {
    throw validationError('Cheque has no billable items to print');
  }

  const cashier = await resolveCashierActor(cashierId, venueId);

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.cheque.update({
      where: { id: chequeId },
      data: { prePaymentCheckPrintCount: { increment: 1 } },
      select: { prePaymentCheckPrintCount: true, chequeNumber: true, tableLabel: true },
    });
    return row;
  });

  const printCount = updated.prePaymentCheckPrintCount;
  const action = printCount === 1 ? 'check.print' : 'check.reprint';
  const summary =
    printCount === 1
      ? `Pre-payment check printed #${updated.chequeNumber}`
      : `Pre-payment check reprinted #${updated.chequeNumber} (copy ${printCount})`;

  await appendAuditLog({
    venueId,
    actorId: cashier.id,
    actorUsername: cashier.username,
    action,
    entityType: 'cheque',
    entityId: chequeId,
    summary,
    details: {
      chequeNumber: updated.chequeNumber,
      tableLabel: updated.tableLabel,
      printCount,
      terminalId: terminalId ?? null,
    },
  });

  const fresh = await loadCheque(chequeId);
  const venue = await prisma.venue.findUnique({ where: { id: venueId } });
  const serialized = serializeCheque(fresh);
  const text = buildChequeReceiptText(serialized, venue, {
    preview: true,
    copyNumber: printCount,
  });

  return { text, printCount, cheque: serialized };
}
