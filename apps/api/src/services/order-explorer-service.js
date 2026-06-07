import { prisma } from '../db/prisma.js';
import { ORDER_STATUSES } from '@venue-pos/shared';
import { notFound, validationError } from '../utils/errors.js';
import { serializeOrder, decimalToNumber } from '../utils/serialize.js';
import { getOrderReceipt } from './order-service.js';
import { getChequeReceipt } from './cheque-pay.js';
import { getCrossVenueGroupSummary } from './cross-venue-service.js';

const PAGE_SIZE = 50;

const listInclude = {
  venue: { select: { id: true, nameEn: true, nameAr: true } },
  cashier: { select: { id: true, username: true } },
  items: { include: { menuItem: true }, orderBy: { createdAt: 'asc' } },
  voidAudit: {
    include: {
      approver: { select: { id: true, username: true } },
      cashier: { select: { id: true, username: true } },
    },
  },
  chequeLink: {
    include: {
      cheque: {
        include: {
          payments: { orderBy: { processedAt: 'asc' } },
          parentCheque: { select: { id: true, chequeNumber: true, venueId: true, status: true } },
          childCheques: {
            select: { id: true, chequeNumber: true, splitLabel: true, status: true, venueId: true },
            orderBy: { chequeNumber: 'asc' },
          },
          refunds: { orderBy: { processedAt: 'desc' } },
        },
      },
    },
  },
};

function endOfDay(date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function orderSubtotal(order) {
  return serializeOrder(order).subtotal;
}

function paymentMethods(cheque) {
  if (!cheque?.payments?.length) return [];
  return [...new Set(cheque.payments.map((p) => p.method))];
}

function serializeListRow(order) {
  const cheque = order.chequeLink?.cheque ?? null;
  return {
    id: order.id,
    venueId: order.venueId,
    venueNameEn: order.venue.nameEn,
    venueNameAr: order.venue.nameAr,
    orderNumber: order.orderNumber,
    tableLabel: order.tableLabel,
    status: order.status,
    cashierId: order.cashierId,
    cashierUsername: order.cashier.username,
    openedAt: order.openedAt,
    sentAt: order.sentAt,
    closedAt: order.closedAt,
    subtotal: orderSubtotal(order),
    chequeId: cheque?.id ?? null,
    chequeNumber: cheque?.chequeNumber ?? null,
    chequeStatus: cheque?.status ?? null,
    paymentMethods: paymentMethods(cheque),
    voidReason: order.voidAudit?.reason ?? null,
  };
}

function serializeChequeLink(cheque) {
  if (!cheque) return null;
  return {
    id: cheque.id,
    chequeNumber: cheque.chequeNumber,
    tableLabel: cheque.tableLabel,
    status: cheque.status,
    venueId: cheque.venueId,
    isCrossVenue: Boolean(cheque.isCrossVenue),
    crossVenueGroupId: cheque.crossVenueGroupId ?? null,
    splitLabel: cheque.splitLabel,
    parentCheque: cheque.parentCheque
      ? {
          id: cheque.parentCheque.id,
          chequeNumber: cheque.parentCheque.chequeNumber,
          venueId: cheque.parentCheque.venueId,
          status: cheque.parentCheque.status,
        }
      : null,
    childCheques: (cheque.childCheques ?? []).map((c) => ({
      id: c.id,
      chequeNumber: c.chequeNumber,
      splitLabel: c.splitLabel,
      status: c.status,
      venueId: c.venueId,
    })),
    payments: (cheque.payments ?? []).map((p) => ({
      id: p.id,
      method: p.method,
      amount: decimalToNumber(p.amount),
      cardLast4: p.cardLast4,
      processedAt: p.processedAt,
    })),
    refunds: (cheque.refunds ?? []).map((r) => ({
      id: r.id,
      amount: decimalToNumber(r.amount),
      method: r.method,
      reason: r.reason,
      processedAt: r.processedAt,
    })),
  };
}

function buildChequeLinkFilter(chequeNumber, venueId) {
  const chequeFilter = { chequeNumber };
  if (venueId) chequeFilter.venueId = venueId;
  return { cheque: chequeFilter };
}

function buildWhere(filters) {
  const where = {};

  if (filters.venueId) where.venueId = filters.venueId;

  if (filters.orderNumber != null) {
    const num = Number(filters.orderNumber);
    if (!Number.isInteger(num) || num < 1) throw validationError('Invalid order number');
    where.orderNumber = num;
  }

  if (filters.chequeNumber != null) {
    const num = Number(filters.chequeNumber);
    if (!Number.isInteger(num) || num < 1) throw validationError('Invalid cheque number');
    where.chequeLink = buildChequeLinkFilter(num, filters.venueId);
  }

  if (filters.tableLabel?.trim()) {
    where.tableLabel = { contains: filters.tableLabel.trim(), mode: 'insensitive' };
  }

  if (filters.status) {
    if (!ORDER_STATUSES.includes(filters.status)) throw validationError('Invalid status');
    where.status = filters.status;
  }

  if (filters.from || filters.to) {
    where.openedAt = {};
    if (filters.from) {
      const from = new Date(filters.from);
      if (Number.isNaN(from.getTime())) throw validationError('Invalid from date');
      where.openedAt.gte = from;
    }
    if (filters.to) {
      const to = endOfDay(new Date(filters.to));
      if (Number.isNaN(to.getTime())) throw validationError('Invalid to date');
      where.openedAt.lte = to;
    }
  }

  if (filters.cashier?.trim()) {
    where.cashier = {
      username: { contains: filters.cashier.trim(), mode: 'insensitive' },
    };
  }

  if (
    filters.q?.trim() &&
    filters.orderNumber == null &&
    filters.chequeNumber == null
  ) {
    const q = filters.q.trim();
    const num = Number(q);
    if (Number.isInteger(num) && num > 0) {
      where.OR = [
        { orderNumber: num },
        { chequeLink: buildChequeLinkFilter(num, filters.venueId) },
      ];
    } else {
      where.OR = [
        { tableLabel: { contains: q, mode: 'insensitive' } },
        { cashier: { username: { contains: q, mode: 'insensitive' } } },
      ];
    }
  }

  if (filters.paymentMethod) {
    if (!['cash', 'card', 'voucher'].includes(filters.paymentMethod)) {
      throw validationError('Invalid payment method');
    }
    const paymentFilter = {
      chequeLink: {
        cheque: { payments: { some: { method: filters.paymentMethod } } },
      },
    };
    if (where.chequeLink) {
      where.AND = [{ chequeLink: where.chequeLink }, paymentFilter];
      delete where.chequeLink;
    } else {
      Object.assign(where, paymentFilter);
    }
  }

  return where;
}

async function filterIdsByAmount(where, minAmount, maxAmount) {
  const orders = await prisma.order.findMany({
    where,
    include: { items: true },
    orderBy: { openedAt: 'desc' },
  });
  return orders
    .filter((o) => {
      const sub = orderSubtotal(o);
      if (minAmount != null && sub < minAmount) return false;
      if (maxAmount != null && sub > maxAmount) return false;
      return true;
    })
    .map((o) => o.id);
}

export async function searchOrders(filters = {}) {
  if (filters.groupBy === 'shift') {
    return searchOrdersGroupedByShift(filters);
  }
  if (filters.groupBy === 'cheque') {
    return searchOrdersGroupedByCheque(filters);
  }

  const page = Math.max(1, Number(filters.page ?? 1));
  const limit = Math.min(PAGE_SIZE, Math.max(1, Number(filters.limit ?? PAGE_SIZE)));
  const where = buildWhere(filters);

  const minAmount = filters.minAmount != null ? Number(filters.minAmount) : null;
  const maxAmount = filters.maxAmount != null ? Number(filters.maxAmount) : null;
  const hasAmountFilter = minAmount != null || maxAmount != null;

  if (minAmount != null && Number.isNaN(minAmount)) throw validationError('Invalid minAmount');
  if (maxAmount != null && Number.isNaN(maxAmount)) throw validationError('Invalid maxAmount');

  let total;
  let rows;

  if (hasAmountFilter) {
    const ids = await filterIdsByAmount(where, minAmount, maxAmount);
    total = ids.length;
    const pageIds = ids.slice((page - 1) * limit, page * limit);
    const orders =
      pageIds.length === 0
        ? []
        : await prisma.order.findMany({
            where: { id: { in: pageIds } },
            include: listInclude,
          });
    const byId = new Map(orders.map((o) => [o.id, o]));
    rows = pageIds.map((id) => serializeListRow(byId.get(id))).filter(Boolean);
  } else {
    total = await prisma.order.count({ where });
    const orders = await prisma.order.findMany({
      where,
      include: listInclude,
      orderBy: { openedAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    });
    rows = orders.map(serializeListRow);
  }

  return {
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
    orders: rows,
  };
}

function groupOrdersIntoCheques(orderRecords) {
  const groups = new Map();

  for (const order of orderRecords) {
    const serialized = serializeListRow(order);
    const cheque = order.chequeLink?.cheque ?? null;
    const key = cheque?.id ?? `orphan:${order.id}`;

    if (!groups.has(key)) {
      groups.set(key, {
        chequeId: cheque?.id ?? null,
        chequeNumber: cheque?.chequeNumber ?? null,
        chequeStatus: cheque?.status ?? null,
        isCrossVenue: Boolean(cheque?.isCrossVenue),
        crossVenueGroupId: cheque?.crossVenueGroupId ?? null,
        tableLabel: cheque?.tableLabel ?? order.tableLabel,
        venueId: order.venueId,
        venueNameEn: order.venue.nameEn,
        venueNameAr: order.venue.nameAr,
        paymentMethods: paymentMethods(cheque),
        openedAt: order.openedAt,
        orders: [],
      });
    }

    const group = groups.get(key);
    group.orders.push(serialized);
    if (new Date(order.openedAt).getTime() > new Date(group.openedAt).getTime()) {
      group.openedAt = order.openedAt;
    }
    if (cheque?.tableLabel) group.tableLabel = cheque.tableLabel;
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      orderCount: group.orders.length,
      orderNumbers: group.orders.map((o) => o.orderNumber),
      totalSubtotal: group.orders.reduce((sum, o) => sum + o.subtotal, 0),
      cashiers: [...new Set(group.orders.map((o) => o.cashierUsername))],
      orders: group.orders.sort((a, b) => a.orderNumber - b.orderNumber),
    }))
    .sort((a, b) => new Date(b.openedAt).getTime() - new Date(a.openedAt).getTime());
}

async function fetchMatchingOrders(filters) {
  const where = buildWhere(filters);
  const minAmount = filters.minAmount != null ? Number(filters.minAmount) : null;
  const maxAmount = filters.maxAmount != null ? Number(filters.maxAmount) : null;
  const hasAmountFilter = minAmount != null || maxAmount != null;

  if (minAmount != null && Number.isNaN(minAmount)) throw validationError('Invalid minAmount');
  if (maxAmount != null && Number.isNaN(maxAmount)) throw validationError('Invalid maxAmount');

  let orders = await prisma.order.findMany({
    where,
    include: listInclude,
    orderBy: { openedAt: 'desc' },
  });

  if (hasAmountFilter) {
    orders = orders.filter((o) => {
      const sub = orderSubtotal(o);
      if (minAmount != null && sub < minAmount) return false;
      if (maxAmount != null && sub > maxAmount) return false;
      return true;
    });
  }

  return orders;
}

function shiftIdFromCheque(cheque) {
  if (!cheque?.payments?.length) return null;
  return cheque.payments.find((p) => p.shiftId)?.shiftId ?? null;
}

function matchShiftByTime(cheque, shifts) {
  if (!cheque) return null;
  const opened = new Date(cheque.openedAt);
  return (
    shifts.find(
      (s) =>
        s.cashierId === cheque.cashierId &&
        (!cheque.terminalId || s.terminalId === cheque.terminalId) &&
        s.openedAt <= opened &&
        (!s.closedAt || s.closedAt >= opened),
    ) ?? null
  );
}

async function attachShiftIdsToChequeGroups(chequeGroups, orderRecords, venueId) {
  const chequeMeta = new Map();
  for (const order of orderRecords) {
    const cheque = order.chequeLink?.cheque;
    if (cheque?.id) chequeMeta.set(cheque.id, cheque);
  }

  const timeMatchCandidates = [];
  for (const group of chequeGroups) {
    if (!group.chequeId) {
      group.shiftId = null;
      continue;
    }
    const cheque = chequeMeta.get(group.chequeId);
    const paymentShiftId = shiftIdFromCheque(cheque);
    if (paymentShiftId) {
      group.shiftId = paymentShiftId;
    } else {
      group.shiftId = null;
      timeMatchCandidates.push({ group, cheque });
    }
  }

  if (timeMatchCandidates.length) {
    const venueIds = venueId
      ? [venueId]
      : [...new Set(timeMatchCandidates.map(({ cheque }) => cheque.venueId))];
    const shifts = await prisma.shift.findMany({
      where: { venueId: { in: venueIds } },
      orderBy: { openedAt: 'desc' },
    });
    for (const { group, cheque } of timeMatchCandidates) {
      const match = matchShiftByTime(cheque, shifts);
      group.shiftId = match?.id ?? null;
    }
  }

  return chequeGroups;
}

async function loadShiftMeta(shiftIds) {
  if (!shiftIds.length) return new Map();
  const shifts = await prisma.shift.findMany({
    where: { id: { in: shiftIds } },
    include: {
      cashier: { select: { username: true } },
      terminal: { select: { name: true } },
    },
  });
  return new Map(shifts.map((s) => [s.id, s]));
}

function groupChequesByShift(chequeGroups, shiftMeta) {
  const buckets = new Map();

  for (const group of chequeGroups) {
    const key = group.shiftId ?? 'unassigned';
    if (!buckets.has(key)) {
      const shift = group.shiftId ? shiftMeta.get(group.shiftId) : null;
      buckets.set(key, {
        shiftId: group.shiftId,
        cashierUsername: shift?.cashier?.username ?? group.cashiers[0] ?? null,
        terminalName: shift?.terminal?.name ?? null,
        openedAt: shift?.openedAt
          ? new Date(shift.openedAt).toISOString()
          : new Date(group.openedAt).toISOString(),
        closedAt: shift?.closedAt ? new Date(shift.closedAt).toISOString() : null,
        status: shift?.status ?? null,
        cheques: [],
      });
    }
    buckets.get(key).cheques.push(group);
  }

  return [...buckets.values()]
    .map((shift) => ({
      ...shift,
      chequeCount: shift.cheques.length,
      totalOrders: shift.cheques.reduce((sum, c) => sum + c.orderCount, 0),
      totalSubtotal: shift.cheques.reduce((sum, c) => sum + c.totalSubtotal, 0),
      cheques: shift.cheques.sort(
        (a, b) => (b.chequeNumber ?? 0) - (a.chequeNumber ?? 0),
      ),
    }))
    .sort((a, b) => new Date(b.openedAt).getTime() - new Date(a.openedAt).getTime());
}

async function buildChequeGroupsFromFilters(filters) {
  const minAmount = filters.minAmount != null ? Number(filters.minAmount) : null;
  const maxAmount = filters.maxAmount != null ? Number(filters.maxAmount) : null;
  const hasAmountFilter = minAmount != null || maxAmount != null;

  if (minAmount != null && Number.isNaN(minAmount)) throw validationError('Invalid minAmount');
  if (maxAmount != null && Number.isNaN(maxAmount)) throw validationError('Invalid maxAmount');

  const orders = await fetchMatchingOrders({
    ...filters,
    minAmount: undefined,
    maxAmount: undefined,
  });
  let groups = groupOrdersIntoCheques(orders);

  if (hasAmountFilter) {
    groups = groups.filter((group) => {
      if (minAmount != null && group.totalSubtotal < minAmount) return false;
      if (maxAmount != null && group.totalSubtotal > maxAmount) return false;
      return true;
    });
  }

  await attachShiftIdsToChequeGroups(groups, orders, filters.venueId);
  return { orders, groups };
}

export async function searchOrdersGroupedByCheque(filters = {}) {
  const page = Math.max(1, Number(filters.page ?? 1));
  const limit = Math.min(PAGE_SIZE, Math.max(1, Number(filters.limit ?? PAGE_SIZE)));

  const { orders, groups } = await buildChequeGroupsFromFilters(filters);
  const total = groups.length;
  const cheques = groups.slice((page - 1) * limit, page * limit);

  return {
    page,
    limit,
    total,
    totalOrders: orders.length,
    totalPages: Math.max(1, Math.ceil(total / limit)),
    groupBy: 'cheque',
    cheques,
  };
}

export async function searchOrdersGroupedByShift(filters = {}) {
  const page = Math.max(1, Number(filters.page ?? 1));
  const limit = Math.min(PAGE_SIZE, Math.max(1, Number(filters.limit ?? PAGE_SIZE)));

  const { orders, groups } = await buildChequeGroupsFromFilters(filters);
  const shiftIds = [...new Set(groups.map((g) => g.shiftId).filter(Boolean))];
  const shiftMeta = await loadShiftMeta(shiftIds);
  const shiftGroups = groupChequesByShift(groups, shiftMeta);

  const total = shiftGroups.length;
  const totalCheques = groups.length;
  const shifts = shiftGroups.slice((page - 1) * limit, page * limit);

  return {
    page,
    limit,
    total,
    totalCheques,
    totalOrders: orders.length,
    totalPages: Math.max(1, Math.ceil(total / limit)),
    groupBy: 'shift',
    shifts,
  };
}

export async function getChequeExplorerDetail(chequeId, venueId) {
  const cheque = await prisma.cheque.findUnique({
    where: { id: chequeId },
    include: {
      venue: { select: { id: true, nameEn: true, nameAr: true } },
      payments: { orderBy: { processedAt: 'asc' } },
      parentCheque: { select: { id: true, chequeNumber: true, venueId: true, status: true } },
      childCheques: {
        select: { id: true, chequeNumber: true, splitLabel: true, status: true, venueId: true },
        orderBy: { chequeNumber: 'asc' },
      },
      refunds: { orderBy: { processedAt: 'desc' } },
    },
  });
  if (!cheque) throw notFound('Cheque not found');
  if (venueId && cheque.venueId !== venueId) throw notFound('Cheque not found');

  const chequeOrders = await loadChequeOrders(chequeId, null);
  const crossVenueGroup = cheque.crossVenueGroupId
    ? await getCrossVenueGroupSummary(cheque.crossVenueGroupId)
    : null;

  return {
    chequeId: cheque.id,
    cheque: serializeChequeLink(cheque),
    crossVenueGroup,
    chequeOrders,
    venueId: cheque.venueId,
    venueNameEn: cheque.venue.nameEn,
    venueNameAr: cheque.venue.nameAr,
    tableLabel: cheque.tableLabel,
    totalSubtotal: chequeOrders.reduce((sum, o) => sum + o.subtotal, 0),
    openedAt: chequeOrders[0]?.openedAt ?? cheque.openedAt,
  };
}

export async function getOrderExplorerDetail(orderId, venueId) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      ...listInclude,
      items: { include: { menuItem: true, compAudit: true }, orderBy: { createdAt: 'asc' } },
    },
  });
  if (!order) throw notFound('Order not found');
  if (venueId && order.venueId !== venueId) throw notFound('Order not found');

  const serialized = serializeOrder(order);
  const cheque = order.chequeLink?.cheque ?? null;
  const chequeOrders = cheque ? await loadChequeOrders(cheque.id, orderId) : [];
  const crossVenueGroup = cheque?.crossVenueGroupId
    ? await getCrossVenueGroupSummary(cheque.crossVenueGroupId)
    : null;

  return {
    ...serialized,
    venueNameEn: order.venue.nameEn,
    venueNameAr: order.venue.nameAr,
    cashierUsername: order.cashier.username,
    voidAudit: order.voidAudit
      ? {
          reason: order.voidAudit.reason,
          createdAt: order.voidAudit.createdAt,
          approverUsername: order.voidAudit.approver.username,
          cashierUsername: order.voidAudit.cashier.username,
        }
      : null,
    cheque: serializeChequeLink(cheque),
    crossVenueGroup,
    chequeOrders,
    compItems: order.items
      .filter((i) => i.compAudit)
      .map((i) => ({
        itemId: i.id,
        reason: i.compAudit.reason,
        nameEn: i.menuItem.nameEn,
        nameAr: i.menuItem.nameAr,
      })),
  };
}

async function loadChequeOrders(chequeId, currentOrderId) {
  const links = await prisma.chequeOrder.findMany({
    where: { chequeId },
    include: {
      order: {
        include: {
          items: { include: { menuItem: true }, orderBy: { createdAt: 'asc' } },
          cashier: { select: { username: true } },
          voidAudit: { select: { reason: true } },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  return links.map(({ order: linked }) => ({
    ...serializeOrder(linked),
    cashierUsername: linked.cashier.username,
    voidReason: linked.voidAudit?.reason ?? null,
    isCurrent: currentOrderId ? linked.id === currentOrderId : false,
  }));
}

export async function getManagerOrderReceipt(orderId, venueId) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, venueId: true },
  });
  if (!order) throw notFound('Order not found');
  if (venueId && order.venueId !== venueId) throw notFound('Order not found');
  const text = await getOrderReceipt(orderId);
  return { text };
}

export async function getManagerChequeReceipt(chequeId, venueId) {
  return getChequeReceipt(chequeId, venueId);
}

export function ordersExplorerToCsv(result) {
  const lines = [
    'order_number,venue,table,cashier,status,subtotal,cheque_number,payment_methods,opened_at,void_reason',
  ];
  for (const row of result.orders) {
    lines.push(
      [
        row.orderNumber,
        csvEscape(row.venueNameEn),
        csvEscape(row.tableLabel ?? ''),
        csvEscape(row.cashierUsername),
        row.status,
        row.subtotal,
        row.chequeNumber ?? '',
        csvEscape((row.paymentMethods ?? []).join('|')),
        row.openedAt,
        csvEscape(row.voidReason ?? ''),
      ].join(','),
    );
  }
  return lines.join('\n');
}

function csvEscape(value) {
  const s = String(value ?? '');
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}
