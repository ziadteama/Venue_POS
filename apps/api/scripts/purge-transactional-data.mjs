/**
 * Dev-only: wipe shifts, cheques, orders, payments, refunds, and related audit/sync rows.
 * Keeps venues, users, menus, terminals, and config.
 *
 * Usage: node scripts/purge-transactional-data.mjs
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const counts = await prisma.$transaction(async (tx) => {
    const floor = await tx.floorTable.updateMany({
      data: { occupiedByChequeId: null, lockedByTerminalId: null },
    });

    const refunds = await tx.refund.deleteMany();
    const approvals = await tx.managerApprovalRequest.deleteMany();
    const transfers = await tx.chequeItemTransferAudit.deleteMany();
    const comps = await tx.orderItemCompAudit.deleteMany();
    const payments = await tx.payment.deleteMany();
    const discounts = await tx.chequeDiscountAudit.deleteMany();
    const voidAudits = await tx.orderVoidAudit.deleteMany();
    const chequeOrders = await tx.chequeOrder.deleteMany();
    const orderItems = await tx.orderItem.deleteMany();
    const orders = await tx.order.deleteMany();
    const childCheques = await tx.cheque.deleteMany({ where: { parentChequeId: { not: null } } });
    const cheques = await tx.cheque.deleteMany();
    const shiftEvents = await tx.shiftEvent.deleteMany();
    const shifts = await tx.shift.deleteMany();
    const auditLogs = await tx.auditLog.deleteMany();
    const syncEvents = await tx.syncEvent.deleteMany();
    const chequeCounters = await tx.chequeNumberCounter.deleteMany();

    return {
      floorTablesCleared: floor.count,
      refunds: refunds.count,
      approvals: approvals.count,
      transfers: transfers.count,
      comps: comps.count,
      payments: payments.count,
      discounts: discounts.count,
      voidAudits: voidAudits.count,
      chequeOrders: chequeOrders.count,
      orderItems: orderItems.count,
      orders: orders.count,
      childCheques: childCheques.count,
      cheques: cheques.count,
      shiftEvents: shiftEvents.count,
      shifts: shifts.count,
      auditLogs: auditLogs.count,
      syncEvents: syncEvents.count,
      chequeCounters: chequeCounters.count,
    };
  });

  console.log('Purged transactional data:', counts);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
