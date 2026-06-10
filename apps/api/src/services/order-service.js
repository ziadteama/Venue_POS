import { prisma } from '../db/prisma.js';
import { notFound, validationError } from '../utils/errors.js';
import { verifyManagerPin } from './auth-service.js';
import { serializeOrder, buildReceiptText } from '../utils/serialize.js';
import { resolveBusinessDate } from '../utils/business-date.js';

const orderInclude = {
  items: {
    include: { menuItem: true },
    orderBy: { createdAt: 'asc' },
  },
};

function validateModifiers(selected, groups) {
  for (const group of groups) {
    const picked = selected.filter((s) => s.groupId === group.id);
    if (picked.length < group.minSelection) {
      throw validationError(`Select at least ${group.minSelection} for ${group.nameEn}`);
    }
    if (picked.length > group.maxSelection) {
      throw validationError(`Select at most ${group.maxSelection} for ${group.nameEn}`);
    }
  }
}

export async function validateCashierForVenue(cashierId, venueId) {
  const cashier = await prisma.user.findFirst({
    where: { id: cashierId, venueId, role: 'cashier', isActive: true },
  });
  if (!cashier) throw validationError('Invalid cashier for venue');
}

export async function createOrder({
  id,
  venueId,
  terminalId,
  cashierId,
  tableLabel,
  floorTableId,
  businessDate = resolveBusinessDate(),
  skipValidation = false,
}) {
  if (!skipValidation) {
    const venue = await prisma.venue.findUnique({ where: { id: venueId } });
    if (!venue) throw notFound('Venue not found');

    await validateCashierForVenue(cashierId, venueId);

    if (terminalId) {
      const terminal = await prisma.terminal.findFirst({
        where: { id: terminalId, venueId, isActive: true },
      });
      if (!terminal) throw validationError('Invalid terminal for venue');
    }
  }

  const order = await prisma.$transaction(async (tx) => {
    const last = await tx.order.findFirst({
      where: { venueId, businessDate },
      orderBy: { orderNumber: 'desc' },
      select: { orderNumber: true },
    });
    const orderNumber = (last?.orderNumber ?? 0) + 1;

    return tx.order.create({
      data: {
        id,
        venueId,
        terminalId,
        cashierId,
        orderNumber,
        businessDate,
        tableLabel,
        floorTableId: floorTableId ?? null,
        status: 'draft',
      },
      include: orderInclude,
    });
  });

  return serializeOrder(order);
}

export async function addOrderItem(orderId, { menuItemId, quantity, modifiers = [] }) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw notFound('Order not found');
  if (order.status !== 'draft') {
    throw validationError('Items can only be added to draft orders');
  }

  const menuItem = await prisma.menuItem.findFirst({
    where: {
      id: menuItemId,
      isActive: true,
      isAvailable: true,
      category: {
        isActive: true,
        venue: { venueMenu: { status: 'published' } },
      },
    },
    include: {
      modifierGroups: {
        include: {
          modifierGroup: {
            include: { options: { where: { isActive: true } } },
          },
        },
      },
    },
  });
  if (!menuItem) throw notFound('Menu item not available');

  const groups = menuItem.modifierGroups.map((l) => l.modifierGroup);
  validateModifiers(modifiers, groups);

  const modifierSnapshot = modifiers.map((m) => ({
    groupId: m.groupId,
    optionId: m.optionId,
    nameEn: m.nameEn,
    nameAr: m.nameAr,
    priceDelta: m.priceDelta ?? 0,
  }));

  const modKey = JSON.stringify(modifierSnapshot);
  const existing = await prisma.orderItem.findMany({
    where: { orderId, menuItemId },
  });
  const match = existing.find(
    (row) => JSON.stringify(row.modifiersSnapshot ?? []) === modKey,
  );

  if (match) {
    await prisma.orderItem.update({
      where: { id: match.id },
      data: { quantity: match.quantity + quantity },
    });
  } else {
    await prisma.orderItem.create({
      data: {
        orderId,
        menuItemId,
        quantity,
        unitPrice: menuItem.price,
        modifiersSnapshot: modifierSnapshot.length ? modifierSnapshot : undefined,
      },
    });
  }

  const updated = await prisma.order.findUnique({
    where: { id: orderId },
    include: orderInclude,
  });
  return serializeOrder(updated);
}

export async function updateOrderItemQuantity(orderId, itemId, quantity) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw notFound('Order not found');
  if (order.status !== 'draft') throw validationError('Order is not editable');

  const item = await prisma.orderItem.findFirst({ where: { id: itemId, orderId } });
  if (!item) throw notFound('Order item not found');

  if (quantity <= 0) {
    await prisma.orderItem.delete({ where: { id: itemId } });
  } else {
    await prisma.orderItem.update({ where: { id: itemId }, data: { quantity } });
  }

  return getOrder(orderId);
}

export async function removeOrderItem(orderId, itemId) {
  return updateOrderItemQuantity(orderId, itemId, 0);
}

export async function updateOrderTableLabel(orderId, tableLabel, venueId) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw notFound('Order not found');
  if (order.venueId !== venueId) throw validationError('Order not found for this terminal');
  if (order.status !== 'draft') throw validationError('Only draft orders can be updated');

  const updated = await prisma.order.update({
    where: { id: orderId },
    data: { tableLabel: tableLabel ?? null },
    include: orderInclude,
  });
  return serializeOrder(updated);
}

export async function abandonDraftOrder(orderId, venueId) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw notFound('Order not found');
  if (order.venueId !== venueId) throw validationError('Order not found for this terminal');
  if (order.status !== 'draft') {
    throw validationError('Only draft orders can be cleared');
  }

  await prisma.order.delete({ where: { id: orderId } });
  return { id: orderId, abandoned: true };
}

export async function voidOrder(orderId, { cashierId, managerPin, reason }, venueId) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw notFound('Order not found');
  if (order.venueId !== venueId) throw validationError('Order not found for this terminal');
  if (!['draft', 'sent'].includes(order.status)) {
    throw validationError('Only draft or sent orders can be voided');
  }
  if (!reason?.trim()) throw validationError('Void reason is required');

  const approver = await verifyManagerPin(venueId, managerPin);

  await prisma.$transaction([
    prisma.orderVoidAudit.create({
      data: {
        orderId,
        cashierId,
        approverId: approver.id,
        reason: reason.trim(),
      },
    }),
    prisma.order.update({
      where: { id: orderId },
      data: { status: 'voided', closedAt: new Date() },
    }),
  ]);

  return getOrder(orderId);
}

export async function sendOrderToKitchen(orderId) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: orderInclude,
  });
  if (!order) throw notFound('Order not found');
  if (order.status !== 'draft') throw validationError('Only draft orders can be sent');
  if (!order.items.length) throw validationError('Cannot send an empty order');

  const updated = await prisma.order.update({
    where: { id: orderId },
    data: { status: 'sent', sentAt: new Date() },
    include: orderInclude,
  });

  return serializeOrder(updated);
}

export async function getOrder(orderId) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: orderInclude,
  });
  if (!order) throw notFound('Order not found');
  return serializeOrder(order);
}

const KITCHEN_ACTIVE_STATUSES = ['sent', 'partially_ready', 'ready'];
const KITCHEN_ITEM_TRANSITIONS = {
  pending: ['in_progress'],
  in_progress: ['ready'],
  ready: ['served'],
  served: [],
};

function deriveOrderStatusFromItems(items) {
  if (!items.length) return 'sent';
  const statuses = items.map((i) => i.kitchenStatus ?? 'pending');
  if (statuses.every((s) => s === 'served')) return 'served';
  if (statuses.every((s) => s === 'ready' || s === 'served')) return 'ready';
  if (statuses.some((s) => s === 'in_progress' || s === 'ready')) return 'partially_ready';
  return 'sent';
}

export async function updateKitchenItemStatus(orderId, itemId, status, venueId) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: orderInclude,
  });
  if (!order) throw notFound('Order not found');
  if (order.venueId !== venueId) throw validationError('Order not found for this venue');
  if (!KITCHEN_ACTIVE_STATUSES.includes(order.status) && order.status !== 'served') {
    throw validationError('Order is not active in kitchen');
  }

  const item = order.items.find((i) => i.id === itemId);
  if (!item) throw notFound('Order item not found');

  const current = item.kitchenStatus ?? 'pending';
  const allowed = KITCHEN_ITEM_TRANSITIONS[current] ?? [];
  if (!allowed.includes(status)) {
    throw validationError(`Cannot transition item from ${current} to ${status}`);
  }

  await prisma.orderItem.update({
    where: { id: itemId },
    data: { kitchenStatus: status },
  });

  const refreshed = await prisma.order.findUnique({
    where: { id: orderId },
    include: orderInclude,
  });
  const nextStatus = deriveOrderStatusFromItems(refreshed.items);

  const updated = await prisma.order.update({
    where: { id: orderId },
    data: { status: nextStatus },
    include: orderInclude,
  });

  return { order: serializeOrder(updated), itemId, kitchenStatus: status };
}

export async function listKitchenOrders(venueId) {
  const orders = await prisma.order.findMany({
    where: { venueId, status: { in: KITCHEN_ACTIVE_STATUSES } },
    include: orderInclude,
    orderBy: { sentAt: 'asc' },
  });
  return orders.map(serializeOrder);
}

export async function getOrderReceipt(orderId) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { ...orderInclude, venue: true },
  });
  if (!order) throw notFound('Order not found');
  const serialized = serializeOrder(order);
  return buildReceiptText(serialized, order.venue);
}
