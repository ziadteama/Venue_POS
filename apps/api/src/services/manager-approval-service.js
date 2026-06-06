import { prisma } from '../db/prisma.js';
import { forbidden, notFound, validationError } from '../utils/errors.js';
import { verifyManagerPinByRole } from './auth-service.js';
import {
  assertDiscountAllowed,
  executeChequeDiscount,
  resolveDiscountAmount,
} from './cheque-discount.js';
import { assertRefundAllowed, executeRefund } from './cheque-refund.js';
import { loadCheque } from './cheque-shared.js';

function serializeRequest(row) {
  const payload = row.payload ?? {};
  return {
    id: row.id,
    venueId: row.venueId,
    chequeId: row.chequeId,
    chequeNumber: row.cheque.chequeNumber,
    tableLabel: row.cheque.tableLabel,
    type: row.type,
    status: row.status,
    payload,
    reason: row.reason,
    rejectReason: row.rejectReason ?? null,
    cashierId: row.cashierId,
    initiatorId: row.initiatorId,
    initiatorName: row.initiator.username,
    approverId: row.approverId ?? null,
    approverName: row.approver?.username ?? null,
    terminalId: row.terminalId ?? null,
    createdAt: row.createdAt.toISOString(),
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
  };
}

const requestInclude = {
  cheque: { select: { chequeNumber: true, tableLabel: true, status: true } },
  initiator: { select: { username: true, role: true } },
  approver: { select: { username: true, role: true } },
};

async function assertNoPendingDuplicate(chequeId, type) {
  const existing = await prisma.managerApprovalRequest.findFirst({
    where: { chequeId, type, status: 'pending' },
  });
  if (existing) {
    throw validationError(`A pending ${type} request already exists for this cheque`);
  }
}

async function resolveInitiator(venueId, { initiatorId, restaurantManagerPin }) {
  if (initiatorId) {
    const user = await prisma.user.findUnique({ where: { id: initiatorId } });
    if (!user?.isActive || user.role !== 'venue_manager' || user.venueId !== venueId) {
      throw forbidden('Only the restaurant manager can submit this request');
    }
    return user;
  }
  if (!restaurantManagerPin) {
    throw validationError('Restaurant manager PIN is required');
  }
  return verifyManagerPinByRole(venueId, restaurantManagerPin, 'venue_manager');
}

export async function requestChequeDiscount(
  chequeId,
  { amount, percent, reason, restaurantManagerPin, cashierId, initiatorId },
  venueId,
  { terminalId } = {},
) {
  const cheque = await loadCheque(chequeId);
  if (cheque.venueId !== venueId) throw validationError('Cheque not found');
  assertDiscountAllowed(cheque);
  if (!reason?.trim()) throw validationError('Discount reason is required');

  resolveDiscountAmount(cheque, { amount, percent });
  await assertNoPendingDuplicate(chequeId, 'discount');

  const initiator = await resolveInitiator(venueId, { initiatorId, restaurantManagerPin });

  const request = await prisma.managerApprovalRequest.create({
    data: {
      venueId,
      chequeId,
      type: 'discount',
      payload: {
        amount: amount != null ? Number(amount) : null,
        percent: percent != null ? Number(percent) : null,
      },
      reason: reason.trim(),
      cashierId: cashierId ?? cheque.cashierId,
      initiatorId: initiator.id,
      terminalId: terminalId ?? null,
    },
    include: requestInclude,
  });

  return serializeRequest(request);
}

export async function requestChequeRefund(
  chequeId,
  { amount, method, reason, restaurantManagerPin, cashierId, initiatorId },
  venueId,
  { terminalId } = {},
) {
  const cheque = await loadCheque(chequeId);
  if (cheque.venueId !== venueId) throw validationError('Cheque not found');
  if (!reason?.trim()) throw validationError('Refund reason is required');

  assertRefundAllowed(cheque, { amount, method });
  await assertNoPendingDuplicate(chequeId, 'refund');

  const initiator = await resolveInitiator(venueId, { initiatorId, restaurantManagerPin });

  const request = await prisma.managerApprovalRequest.create({
    data: {
      venueId,
      chequeId,
      type: 'refund',
      payload: {
        amount: Number(amount),
        method: method ?? 'cash',
      },
      reason: reason.trim(),
      cashierId: cashierId ?? cheque.cashierId,
      initiatorId: initiator.id,
      terminalId: terminalId ?? null,
    },
    include: requestInclude,
  });

  return serializeRequest(request);
}

export async function listApprovalRequests(venueId, { status = 'pending', limit = 50 } = {}) {
  const rows = await prisma.managerApprovalRequest.findMany({
    where: {
      venueId,
      ...(status ? { status } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: requestInclude,
  });
  return rows.map(serializeRequest);
}

export async function getPendingRequestsForCheque(chequeId, venueId) {
  const recentCutoff = new Date(Date.now() - 10 * 60 * 1000);
  const rows = await prisma.managerApprovalRequest.findMany({
    where: {
      chequeId,
      venueId,
      OR: [{ status: 'pending' }, { resolvedAt: { gte: recentCutoff } }],
    },
    orderBy: { createdAt: 'desc' },
    include: requestInclude,
  });
  return rows.map(serializeRequest);
}

export async function approveRequest(requestId, approverUserId, venueId) {
  const approver = await prisma.user.findUnique({ where: { id: approverUserId } });
  if (!approver?.isActive || approver.role !== 'hub_manager') {
    throw forbidden('Only the general manager can approve requests');
  }
  if (approver.venueId && approver.venueId !== venueId) {
    throw forbidden('General manager cannot approve for this venue');
  }

  const request = await prisma.managerApprovalRequest.findUnique({
    where: { id: requestId },
    include: requestInclude,
  });
  if (!request || request.venueId !== venueId) throw notFound('Approval request not found');
  if (request.status !== 'pending') throw validationError('Request is no longer pending');

  let result;
  if (request.type === 'discount') {
    result = await executeChequeDiscount(
      request.chequeId,
      {
        amount: request.payload.amount,
        percent: request.payload.percent,
        reason: request.reason,
        initiatorId: request.initiatorId,
        approverId: approver.id,
        cashierId: request.cashierId,
      },
      venueId,
    );
  } else if (request.type === 'refund') {
    result = await executeRefund(
      request.chequeId,
      {
        amount: request.payload.amount,
        method: request.payload.method,
        reason: request.reason,
        initiatorId: request.initiatorId,
        approverId: approver.id,
        cashierId: request.cashierId,
        terminalId: request.terminalId,
      },
      venueId,
    );
  } else {
    throw validationError('Unsupported request type');
  }

  const updated = await prisma.managerApprovalRequest.update({
    where: { id: requestId },
    data: {
      status: 'approved',
      approverId: approver.id,
      resolvedAt: new Date(),
    },
    include: requestInclude,
  });

  return {
    request: serializeRequest(updated),
    result,
  };
}

export async function rejectRequest(requestId, approverUserId, venueId, rejectReason) {
  const approver = await prisma.user.findUnique({ where: { id: approverUserId } });
  if (!approver?.isActive || approver.role !== 'hub_manager') {
    throw forbidden('Only the general manager can reject requests');
  }

  const request = await prisma.managerApprovalRequest.findUnique({
    where: { id: requestId },
    include: requestInclude,
  });
  if (!request || request.venueId !== venueId) throw notFound('Approval request not found');
  if (request.status !== 'pending') throw validationError('Request is no longer pending');

  const updated = await prisma.managerApprovalRequest.update({
    where: { id: requestId },
    data: {
      status: 'rejected',
      approverId: approver.id,
      rejectReason: rejectReason?.trim() || 'Rejected',
      resolvedAt: new Date(),
    },
    include: requestInclude,
  });

  return serializeRequest(updated);
}

export async function countPendingApprovals(venueId) {
  return prisma.managerApprovalRequest.count({
    where: { venueId, status: 'pending' },
  });
}
