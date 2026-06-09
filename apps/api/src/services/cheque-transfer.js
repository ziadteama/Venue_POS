import { prisma } from '../db/prisma.js';
import { config } from '../config.js';
import { forbidden, validationError } from '../utils/errors.js';
import { verifyManagerPin } from './auth-service.js';
import {
  BILLABLE_ORDER_STATUSES,
  billingOrdersFromCheque,
  findDraftOrder,
  loadCheque,
  ordersFromCheque,
} from './cheque-shared.js';
import { getCheque, openOrResumeCheque } from './cheque-lifecycle.js';

function assertLineTransferEnabled() {
  if (!config.featureLineTransferEnabled) {
    throw forbidden('Line transfer is disabled for this deployment');
  }
}

function transferableItems(cheque) {
  const isParent = !cheque.parentChequeId;
  return billingOrdersFromCheque(cheque)
    .filter((o) => BILLABLE_ORDER_STATUSES.includes(o.status))
    .flatMap((o) => o.items)
    .filter((i) => !i.paidAt && !i.isComped && (isParent ? !i.billingChequeId : true));
}

async function resolveTargetCheque(
  { targetChequeId, targetTableLabel },
  { venueId, terminalId, cashierId, sourceChequeId },
) {
  if (targetChequeId) {
    const target = await loadCheque(targetChequeId);
    if (target.venueId !== venueId) throw validationError('Target cheque not found');
    if (target.status !== 'open') throw validationError('Target cheque is not open');
    if (target.id === sourceChequeId) throw validationError('Cannot transfer to the same cheque');
    if (target.parentChequeId) throw validationError('Cannot transfer to a split sub-cheque');
    return target;
  }

  const label = targetTableLabel?.trim();
  if (!label) throw validationError('targetChequeId or targetTableLabel required');

  const serialized = await openOrResumeCheque({ venueId, terminalId, cashierId, tableLabel: label });
  if (serialized.id === sourceChequeId) throw validationError('Cannot transfer to the same cheque');
  return loadCheque(serialized.id);
}

export async function transferChequeItems(
  sourceChequeId,
  { itemIds, targetChequeId, targetTableLabel, managerPin, reason, cashierId },
  venueId,
  terminalId,
) {
  assertLineTransferEnabled();

  if (!itemIds?.length) throw validationError('At least one item is required');
  if (!managerPin) throw validationError('Manager PIN required for line transfer');

  const approver = await verifyManagerPin(venueId, managerPin);

  const source = await loadCheque(sourceChequeId);
  if (source.venueId !== venueId) throw validationError('Cheque not found for this terminal');
  if (source.status !== 'open') throw validationError('Source cheque is not open');
  if (source.parentChequeId) throw validationError('Cannot transfer from a split sub-cheque');

  const draft = findDraftOrder(source);
  if (draft?.items?.length) {
    throw validationError('Send or clear the current round before transferring');
  }

  const allowed = transferableItems(source);
  const uniqueIds = [...new Set(itemIds)];
  for (const id of uniqueIds) {
    if (!allowed.some((i) => i.id === id)) {
      throw validationError('Invalid or non-transferable item');
    }
  }

  const target = await resolveTargetCheque(
    { targetChequeId, targetTableLabel },
    { venueId, terminalId, cashierId, sourceChequeId },
  );

  const items = allowed.filter((i) => uniqueIds.includes(i.id));
  const sourceOrderStatus = ordersFromCheque(source).find((o) =>
    o.items.some((i) => uniqueIds.includes(i.id)),
  )?.status;

  await prisma.$transaction(async (tx) => {
    const businessDate = target.businessDate;
    const last = await tx.order.findFirst({
      where: { venueId, businessDate },
      orderBy: { orderNumber: 'desc' },
      select: { orderNumber: true },
    });
    const orderNumber = (last?.orderNumber ?? 0) + 1;

    const transferOrder = await tx.order.create({
      data: {
        venueId,
        terminalId: target.terminalId ?? terminalId,
        cashierId,
        orderNumber,
        businessDate,
        tableLabel: target.tableLabel,
        status: sourceOrderStatus ?? 'sent',
        sentAt: new Date(),
      },
    });

    await tx.chequeOrder.create({
      data: { chequeId: target.id, orderId: transferOrder.id },
    });

    for (const item of items) {
      await tx.orderItem.update({
        where: { id: item.id },
        data: { orderId: transferOrder.id, billingChequeId: null },
      });

      await tx.chequeItemTransferAudit.create({
        data: {
          sourceChequeId: source.id,
          targetChequeId: target.id,
          orderItemId: item.id,
          cashierId,
          approverId: approver.id,
          reason: reason?.trim() || null,
        },
      });
    }
  });

  return {
    source: await getCheque(sourceChequeId, venueId),
    target: await getCheque(target.id, venueId),
  };
}

export async function listTransferAudits(venueId, { limit = 50 } = {}) {
  const rows = await prisma.chequeItemTransferAudit.findMany({
    where: {
      OR: [{ sourceCheque: { venueId } }, { targetCheque: { venueId } }],
    },
    include: {
      orderItem: { include: { menuItem: true } },
      sourceCheque: { select: { chequeNumber: true, tableLabel: true } },
      targetCheque: { select: { chequeNumber: true, tableLabel: true } },
      cashier: { select: { username: true } },
      approver: { select: { username: true, role: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  return rows.map((r) => ({
    id: r.id,
    sourceChequeId: r.sourceChequeId,
    targetChequeId: r.targetChequeId,
    sourceTable: r.sourceCheque.tableLabel,
    targetTable: r.targetCheque.tableLabel,
    sourceChequeNumber: r.sourceCheque.chequeNumber,
    targetChequeNumber: r.targetCheque.chequeNumber,
    itemNameEn: r.orderItem.menuItem?.nameEn ?? null,
    cashierUsername: r.cashier.username,
    approverUsername: r.approver.username,
    approverRole: r.approver.role,
    reason: r.reason,
    createdAt: r.createdAt.toISOString(),
  }));
}
