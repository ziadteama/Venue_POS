import { prisma } from '../db/prisma.js';
import { forbidden, notFound, validationError } from '../utils/errors.js';
import { verifyManagerPin, verifyManagerPinByRole } from './auth-service.js';
import { assertRefundAllowed, executeRefund } from './cheque-refund.js';
import { loadCheque } from './cheque-shared.js';

function serializeApprovalRequest(row) {
  return {
    id: row.id,
    venueId: row.venueId,
    chequeId: row.chequeId,
    type: row.type,
    status: row.status,
    payload: row.payload,
    reason: row.reason,
    rejectReason: row.rejectReason,
    cashierId: row.cashierId,
    initiatorId: row.initiatorId,
    initiatorUsername: row.initiator?.username ?? null,
    approverId: row.approverId,
    approverUsername: row.approver?.username ?? null,
    chequeNumber: row.cheque?.chequeNumber ?? null,
    tableLabel: row.cheque?.tableLabel ?? null,
    terminalId: row.terminalId ?? null,
    createdAt: row.createdAt.toISOString(),
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
  };
}

const requestInclude = {
  cheque: { select: { chequeNumber: true, tableLabel: true } },
  initiator: { select: { username: true, role: true } },
  approver: { select: { username: true, role: true } },
};

async function assertNoPendingRefund(chequeId) {
  const existing = await prisma.managerApprovalRequest.findFirst({
    where: { chequeId, type: 'refund', status: 'pending' },
  });
  if (existing) {
    throw validationError('A refund request is already pending for this cheque');
  }
}

export async function createRefundRequest(
  chequeId,
  { amount, method, reason, initiatorId, cashierId, terminalId, restaurantManagerPin },
  venueId,
) {
  const cheque = await loadCheque(chequeId);
  if (cheque.venueId !== venueId) throw validationError('Cheque not found');
  if (!reason?.trim()) throw validationError('Refund reason is required');

  assertRefundAllowed(cheque, { amount, method });
  await assertNoPendingRefund(chequeId);

  let initiator;
  if (initiatorId) {
    initiator = await prisma.user.findUnique({ where: { id: initiatorId } });
    if (!initiator?.isActive || initiator.role !== 'venue_manager' || initiator.venueId !== venueId) {
      throw forbidden('Only the venue manager can request a refund');
    }
  } else {
    if (!restaurantManagerPin) throw validationError('Venue manager PIN is required');
    initiator = await verifyManagerPin(venueId, restaurantManagerPin);
  }

  const request = await prisma.managerApprovalRequest.create({
    data: {
      venueId,
      chequeId,
      type: 'refund',
      status: 'pending',
      payload: { amount: Number(amount), method: method ?? 'cash' },
      reason: reason.trim(),
      cashierId: cashierId ?? cheque.cashierId,
      initiatorId: initiator.id,
      terminalId: terminalId ?? null,
    },
    include: requestInclude,
  });

  return serializeApprovalRequest(request);
}

export async function listApprovalRequests(venueId, { status, type = 'refund', limit = 50 } = {}) {
  const where = {
    ...(venueId ? { venueId } : {}),
    type,
    ...(status ? { status } : {}),
  };

  const rows = await prisma.managerApprovalRequest.findMany({
    where,
    include: requestInclude,
    orderBy: { createdAt: 'desc' },
    take: Math.min(100, Math.max(1, limit)),
  });

  return rows.map(serializeApprovalRequest);
}

export async function getPendingRefundForCheque(chequeId, venueId) {
  const row = await prisma.managerApprovalRequest.findFirst({
    where: {
      chequeId,
      venueId,
      type: 'refund',
      status: 'pending',
    },
    include: requestInclude,
  });
  return row ? serializeApprovalRequest(row) : null;
}

async function loadPendingRefundRequest(requestId, venueId) {
  const request = await prisma.managerApprovalRequest.findUnique({
    where: { id: requestId },
    include: requestInclude,
  });
  if (!request) throw notFound('Approval request not found');
  if (request.type !== 'refund') throw validationError('Unsupported approval type');
  if (venueId && request.venueId !== venueId) throw notFound('Approval request not found');
  if (request.status !== 'pending') throw validationError('Request is no longer pending');
  return request;
}

export async function approveRefundRequest(
  requestId,
  approverId,
  { managerPin, venueId } = {},
) {
  const request = await loadPendingRefundRequest(requestId, venueId);

  let approver;
  if (approverId) {
    approver = await prisma.user.findUnique({ where: { id: approverId } });
    if (!approver?.isActive || approver.role !== 'hub_manager') {
      throw forbidden('Only the hub manager can approve refunds');
    }
  } else if (managerPin) {
    approver = await verifyManagerPinByRole(request.venueId, managerPin, 'hub_manager');
  } else {
    throw validationError('Hub manager authorization is required');
  }

  const { amount, method } = request.payload;
  const result = await executeRefund(
    request.chequeId,
    {
      amount,
      method,
      reason: request.reason,
      initiatorId: request.initiatorId,
      approverId: approver.id,
      cashierId: request.cashierId,
      terminalId: request.terminalId,
    },
    request.venueId,
  );

  const updated = await prisma.managerApprovalRequest.update({
    where: { id: request.id },
    data: {
      status: 'approved',
      approverId: approver.id,
      resolvedAt: new Date(),
    },
    include: requestInclude,
  });

  return {
    request: serializeApprovalRequest(updated),
    ...result,
  };
}

export async function rejectRefundRequest(
  requestId,
  approverId,
  { rejectReason, managerPin, venueId } = {},
) {
  const request = await loadPendingRefundRequest(requestId, venueId);

  let approver;
  if (approverId) {
    approver = await prisma.user.findUnique({ where: { id: approverId } });
    if (!approver?.isActive || approver.role !== 'hub_manager') {
      throw forbidden('Only the hub manager can reject refunds');
    }
  } else if (managerPin) {
    approver = await verifyManagerPinByRole(request.venueId, managerPin, 'hub_manager');
  } else {
    throw validationError('Hub manager authorization is required');
  }

  if (!rejectReason?.trim()) throw validationError('Rejection reason is required');

  const updated = await prisma.managerApprovalRequest.update({
    where: { id: request.id },
    data: {
      status: 'rejected',
      approverId: approver.id,
      rejectReason: rejectReason.trim(),
      resolvedAt: new Date(),
    },
    include: requestInclude,
  });

  return serializeApprovalRequest(updated);
}

export async function forceHubRefund(
  chequeId,
  { amount, method, reason, approverId, managerPin, cashierId },
  venueId,
) {
  const cheque = await loadCheque(chequeId);
  if (cheque.venueId !== venueId) throw validationError('Cheque not found');
  if (!reason?.trim()) throw validationError('Refund reason is required');

  assertRefundAllowed(cheque, { amount, method });

  let approver;
  if (approverId) {
    approver = await prisma.user.findUnique({ where: { id: approverId } });
    if (!approver?.isActive || approver.role !== 'hub_manager') {
      throw forbidden('Only the hub manager can force a refund');
    }
  } else if (managerPin) {
    approver = await verifyManagerPin(cheque.venueId, managerPin);
    if (approver.role !== 'hub_manager') {
      throw forbidden('Only the hub manager can force a refund');
    }
  } else {
    throw validationError('Hub manager authorization is required');
  }

  return executeRefund(
    chequeId,
    {
      amount,
      method,
      reason: reason.trim(),
      initiatorId: approver.id,
      approverId: approver.id,
      cashierId: cashierId ?? cheque.cashierId,
    },
    venueId,
  );
}
