import { prisma } from '../db/prisma.js';
import { notFound, validationError } from '../utils/errors.js';
import { listManagerActivity } from './manager-action-service.js';

const PAGE_SIZE = 100;
const DOMAIN_TYPES = new Set([
  'discount',
  'discount_change',
  'discount_remove',
  'refund',
  'void',
  'comp',
  'transfer',
]);
const NEEDS_REVIEW_DOMAIN_TYPES = new Set([
  'discount',
  'discount_change',
  'discount_remove',
  'refund',
  'void',
  'comp',
  'transfer',
]);
const NEEDS_REVIEW_AUDIT_EXACT = new Set([
  'check.reprint',
  'check.pre_pay_adjust',
  'user.pin_reset',
]);
const NEEDS_REVIEW_AUDIT_PREFIXES = ['discount', 'refund', 'void', 'comp', 'transfer'];

function isNeedsReviewFilter(type) {
  return type === 'needs_review' || type === 'fraud_watch';
}

export async function appendAuditLog({
  venueId = null,
  actorId = null,
  actorUsername = null,
  action,
  entityType = null,
  entityId = null,
  summary,
  details = null,
}) {
  return prisma.auditLog.create({
    data: {
      venueId,
      actorId,
      actorUsername,
      action,
      entityType,
      entityId,
      summary: summary.slice(0, 500),
      details,
    },
  });
}

function endOfDay(date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function parseDateRange(from, to) {
  const range = {};
  if (from) {
    const start = new Date(from);
    if (Number.isNaN(start.getTime())) throw validationError('Invalid from date');
    range.gte = start;
  }
  if (to) {
    const end = endOfDay(new Date(to));
    if (Number.isNaN(end.getTime())) throw validationError('Invalid to date');
    range.lte = end;
  }
  return Object.keys(range).length ? range : undefined;
}

const SHIFT_TYPE_FILTERS = new Set(['shift', 'shift_open', 'shift_close']);

const CHECK_AUDIT_FILTERS = {
  check_print: 'check.print',
  check_reprint: 'check.reprint',
  check_pre_pay_adjust: 'check.pre_pay_adjust',
};

function auditEventType(action) {
  if (action?.startsWith('check.')) return action.replace(/\./g, '_');
  return action?.split('.')[0] ?? action;
}

function resolveChequeId(row) {
  if (row.entityType === 'cheque' && row.entityId) return row.entityId;
  return row.details?.chequeId ?? null;
}

function field(key, value) {
  if (value == null || value === '') return null;
  return { key, value };
}

function buildDetailFields(event) {
  const d = event.details ?? {};
  const fields = [
    field('cheque', event.chequeNumber != null ? `#${event.chequeNumber}` : null),
    field('table', event.tableLabel ?? d.tableLabel),
    field('amount', event.amount != null ? Number(event.amount).toFixed(2) : null),
    field('method', event.method ?? d.method),
    field('percent', event.percent != null ? `${event.percent}%` : d.percent != null ? `${d.percent}%` : null),
    field('previousAmount', event.previousAmount != null ? Number(event.previousAmount).toFixed(2) : null),
    field('reason', event.reason ?? d.reason),
    field('cashier', event.cashier ?? d.cashier ?? (event.action === 'check.pre_pay_adjust' ? event.actor : null)),
    field('initiator', event.initiator ?? d.initiator),
    field('approver', event.approver ?? d.approver ?? event.manager),
    field('item', event.itemName ?? d.itemName),
    field('order', event.orderNumber != null ? `#${event.orderNumber}` : d.orderNumber != null ? `#${d.orderNumber}` : null),
    field('quantityChange',
      d.previousQty != null
        ? `${d.previousQty} → ${d.newQty ?? 0}`
        : null,
    ),
    field('sourceCheque', event.sourceChequeNumber != null ? `#${event.sourceChequeNumber}` : null),
    field('targetCheque', event.targetChequeNumber != null ? `#${event.targetChequeNumber}` : null),
    field('targetTable', event.targetTable ?? d.targetTable),
    field('printCount', d.printCount != null ? String(d.printCount) : null),
    field('targetUser', event.targetUsername ?? d.targetUsername),
    field('closeFloat', d.closeFloat != null ? Number(d.closeFloat).toFixed(2) : null),
    field('expectedCash', d.expectedCash != null ? Number(d.expectedCash).toFixed(2) : null),
    field('overShort', event.amount != null && event.type === 'shift_force_close'
      ? Number(event.amount).toFixed(2)
      : d.overShortAmount != null
        ? Number(d.overShortAmount).toFixed(2)
        : null),
  ].filter(Boolean);

  const seen = new Set();
  return fields.filter((f) => {
    if (seen.has(f.key)) return false;
    seen.add(f.key);
    return true;
  });
}

function finalizeAuditEvent(base) {
  const chequeId =
    base.chequeId ??
    (base.entityType === 'cheque' ? base.entityId : null) ??
    resolveChequeId({ entityType: base.entityType, entityId: base.entityId, details: base.details });
  const event = {
    ...base,
    chequeId,
    initiator: base.initiator ?? base.details?.initiator ?? null,
    approver: base.approver ?? base.details?.approver ?? base.manager ?? null,
  };
  return {
    ...event,
    fields: buildDetailFields(event),
    links: buildAuditLinks(event),
  };
}

function buildAuditLinks(event) {
  const links = [];
  if (event.chequeId && event.venueId) {
    links.push({ type: 'cheque', chequeId: event.chequeId, venueId: event.venueId });
  }
  if (event.targetChequeId && event.venueId) {
    links.push({ type: 'cheque', chequeId: event.targetChequeId, venueId: event.venueId, labelKey: 'targetCheque' });
  }
  if (event.shiftId && event.venueId) {
    links.push({ type: 'shift', shiftId: event.shiftId, venueId: event.venueId });
  }
  return links;
}

async function fetchAuditLogRows(venueId, filters) {
  if (filters.type && SHIFT_TYPE_FILTERS.has(filters.type)) return [];

  const where = {};
  if (venueId) where.venueId = venueId;
  if (isNeedsReviewFilter(filters.type)) {
    where.OR = [
      ...[...NEEDS_REVIEW_AUDIT_EXACT].map((action) => ({ action })),
      ...NEEDS_REVIEW_AUDIT_PREFIXES.map((prefix) => ({
        action: { startsWith: prefix },
      })),
    ];
  } else if (filters.type && filters.type !== 'all') {
    if (CHECK_AUDIT_FILTERS[filters.type]) {
      where.action = CHECK_AUDIT_FILTERS[filters.type];
    } else {
      where.action = filters.type.includes('.') ? filters.type : { startsWith: filters.type };
    }
  }
  if (filters.user?.trim()) {
    where.actorUsername = { contains: filters.user.trim(), mode: 'insensitive' };
  }
  const createdAt = parseDateRange(filters.from, filters.to);
  if (createdAt) where.createdAt = createdAt;
  if (filters.q?.trim()) {
    where.OR = [
      { summary: { contains: filters.q.trim(), mode: 'insensitive' } },
      { actorUsername: { contains: filters.q.trim(), mode: 'insensitive' } },
      { entityId: { contains: filters.q.trim(), mode: 'insensitive' } },
    ];
  }

  const rows = await prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 500,
  });

  return rows.map((row) =>
    finalizeAuditEvent({
      id: `log:${row.id}`,
      type: auditEventType(row.action),
      action: row.action,
      at: row.createdAt.toISOString(),
      venueId: row.venueId,
      actor: row.actorUsername,
      summary: row.summary,
      entityType: row.entityType,
      entityId: row.entityId,
      details: row.details,
      chequeId: resolveChequeId(row),
      chequeNumber: row.details?.chequeNumber ?? null,
      tableLabel: row.details?.tableLabel ?? null,
      amount: row.details?.amount ?? null,
      method: row.details?.method ?? null,
      reason: row.details?.reason ?? null,
      initiator: row.details?.initiator ?? null,
      approver: row.details?.approver ?? null,
      itemName: row.details?.itemName ?? null,
      orderNumber: row.details?.orderNumber ?? null,
      manager: row.actorUsername,
      detail: row.summary,
    }),
  );
}

async function fetchDomainActivity(venueId, filters) {
  if (
    filters.type &&
    filters.type !== 'all' &&
    !isNeedsReviewFilter(filters.type) &&
    !DOMAIN_TYPES.has(filters.type)
  ) {
    return [];
  }
  const events = await listManagerActivity(venueId, { limit: 200 });
  let filtered = events;
  if (isNeedsReviewFilter(filters.type)) {
    filtered = filtered.filter((ev) => NEEDS_REVIEW_DOMAIN_TYPES.has(ev.type));
  } else if (filters.type && filters.type !== 'all') {
    filtered = filtered.filter((ev) =>
      filters.type === 'discount'
        ? ev.type === 'discount' || ev.type === 'discount_change' || ev.type === 'discount_remove'
        : ev.type === filters.type,
    );
  }
  if (filters.user?.trim()) {
    const q = filters.user.trim().toLowerCase();
    filtered = filtered.filter((ev) => ev.manager?.toLowerCase().includes(q));
  }
  if (filters.q?.trim()) {
    const q = filters.q.trim().toLowerCase();
    filtered = filtered.filter(
      (ev) =>
        ev.detail?.toLowerCase().includes(q) ||
        ev.reason?.toLowerCase().includes(q) ||
        String(ev.chequeNumber ?? '').includes(q),
    );
  }
  if (filters.from || filters.to) {
    const fromMs = filters.from ? new Date(filters.from).getTime() : 0;
    const toMs = filters.to ? endOfDay(new Date(filters.to)).getTime() : Infinity;
    filtered = filtered.filter((ev) => {
      const t = new Date(ev.at).getTime();
      return t >= fromMs && t <= toMs;
    });
  }
  return filtered.map((ev) =>
    finalizeAuditEvent({
      ...ev,
      id: `domain:${ev.type}:${ev.id}`,
      action: ev.type,
      actor: ev.manager,
      summary: ev.detail ?? ev.reason ?? ev.type,
      entityType: ev.chequeId ? 'cheque' : null,
      entityId: ev.chequeId ?? ev.orderId ?? null,
    }),
  );
}

async function fetchConfigAudits(venueId, filters) {
  if (isNeedsReviewFilter(filters.type)) return [];
  if (filters.type && filters.type !== 'all' && filters.type !== 'config') return [];
  const where = { venueId };
  const createdAt = parseDateRange(filters.from, filters.to);
  if (createdAt) where.createdAt = createdAt;

  const rows = await prisma.venueConfigAudit.findMany({
    where,
    include: { user: { select: { username: true } } },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });

  return rows
    .filter((row) => {
      if (!filters.user?.trim()) return true;
      return row.user.username?.toLowerCase().includes(filters.user.trim().toLowerCase());
    })
    .map((row) => ({
      id: `config:${row.id}`,
      type: 'config',
      action: 'config.updated',
      at: row.createdAt.toISOString(),
      venueId: row.venueId,
      actor: row.user.username,
      summary: `Venue configuration updated (${Object.keys(row.changes ?? {}).length} fields)`,
      details: row.changes,
      manager: row.user.username,
      detail: 'Venue configuration updated',
    }));
}

async function fetchShiftEvents(venueId, filters) {
  if (
    filters.type &&
    filters.type !== 'all' &&
    !isNeedsReviewFilter(filters.type) &&
    !SHIFT_TYPE_FILTERS.has(filters.type)
  ) {
    return [];
  }

  const where = { shift: { venueId } };
  if (isNeedsReviewFilter(filters.type)) {
    where.action = 'close';
    where.details = { path: ['forcedByManager'], equals: true };
  } else {
    if (filters.type === 'shift_open') where.action = 'open';
    if (filters.type === 'shift_close') where.action = 'close';
  }
  if (filters.user?.trim()) {
    where.user = { username: { contains: filters.user.trim(), mode: 'insensitive' } };
  }
  const createdAt = parseDateRange(filters.from, filters.to);
  if (createdAt) where.createdAt = createdAt;

  const rows = await prisma.shiftEvent.findMany({
    where,
    include: {
      user: { select: { username: true } },
      shift: { select: { id: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });

  let mapped = rows.map((row) => {
    const forced = row.details?.forcedByManager === true;
    return finalizeAuditEvent({
      id: `shift:${row.id}`,
      type: forced ? 'shift_force_close' : row.action === 'open' ? 'shift_open' : 'shift_close',
      action: forced ? 'shift.force_close' : `shift.${row.action}`,
      at: row.createdAt.toISOString(),
      venueId,
      shiftId: row.shift.id,
      actor: row.user.username,
      summary: forced ? 'Shift force-closed by manager' : `Shift ${row.action}`,
      details: row.details,
      manager: row.user.username,
      detail: forced ? 'Shift force-closed by manager' : `Shift ${row.action}`,
      amount: row.details?.overShortAmount ?? null,
      reason: forced ? 'Manager force-close' : null,
    });
  });

  if (filters.q?.trim()) {
    const q = filters.q.trim().toLowerCase();
    mapped = mapped.filter(
      (ev) =>
        ev.summary?.toLowerCase().includes(q) ||
        ev.actor?.toLowerCase().includes(q) ||
        ev.detail?.toLowerCase().includes(q),
    );
  }

  return mapped;
}

export async function getAuditEventDetail(eventId, venueScopeId) {
  if (!eventId?.trim()) throw validationError('eventId is required');

  if (eventId.startsWith('log:')) {
    const id = eventId.slice(4);
    const row = await prisma.auditLog.findUnique({ where: { id } });
    if (!row) throw notFound('Event not found');
    if (venueScopeId && row.venueId !== venueScopeId) throw notFound('Event not found');
    let targetUsername = null;
    if (row.entityType === 'user' && row.entityId) {
      const user = await prisma.user.findUnique({
        where: { id: row.entityId },
        select: { username: true },
      });
      targetUsername = user?.username ?? null;
    }
    return finalizeAuditEvent({
      id: `log:${row.id}`,
      type: auditEventType(row.action),
      action: row.action,
      at: row.createdAt.toISOString(),
      venueId: row.venueId,
      actor: row.actorUsername,
      summary: row.summary,
      entityType: row.entityType,
      entityId: row.entityId,
      details: row.details,
      chequeId: resolveChequeId(row),
      chequeNumber: row.details?.chequeNumber ?? null,
      tableLabel: row.details?.tableLabel ?? null,
      amount: row.details?.amount ?? null,
      method: row.details?.method ?? null,
      reason: row.details?.reason ?? null,
      initiator: row.details?.initiator ?? null,
      approver: row.details?.approver ?? null,
      itemName: row.details?.itemName ?? null,
      orderNumber: row.details?.orderNumber ?? null,
      targetUsername,
      manager: row.actorUsername,
      detail: row.summary,
    });
  }

  if (eventId.startsWith('domain:')) {
    const [, type, id] = eventId.split(':');
    if (!type || !id) throw notFound('Event not found');

    if (['discount', 'discount_change', 'discount_remove'].includes(type)) {
      const row = await prisma.chequeDiscountAudit.findUnique({
        where: { id },
        include: {
          cheque: { select: { id: true, chequeNumber: true, tableLabel: true, venueId: true } },
          initiator: { select: { username: true } },
          approver: { select: { username: true } },
        },
      });
      if (!row) throw notFound('Event not found');
      if (venueScopeId && row.cheque.venueId !== venueScopeId) throw notFound('Event not found');
      return finalizeAuditEvent({
        id: eventId,
        type,
        action: type,
        at: row.createdAt.toISOString(),
        venueId: row.cheque.venueId,
        chequeId: row.chequeId,
        chequeNumber: row.cheque.chequeNumber,
        tableLabel: row.cheque.tableLabel,
        amount: Number(row.amount),
        previousAmount: row.previousAmount != null ? Number(row.previousAmount) : null,
        percent: row.percent != null ? Number(row.percent) : null,
        reason: row.reason,
        initiator: row.initiator.username,
        approver: row.approver.username,
        actor: row.approver.username,
        manager: row.approver.username,
        summary: row.reason,
        detail: row.reason,
        entityType: 'cheque',
        entityId: row.chequeId,
      });
    }

    if (type === 'refund') {
      const row = await prisma.refund.findUnique({
        where: { id },
        include: {
          cheque: { select: { id: true, chequeNumber: true, tableLabel: true, venueId: true } },
          initiator: { select: { username: true } },
          approver: { select: { username: true } },
        },
      });
      if (!row) throw notFound('Event not found');
      if (venueScopeId && row.cheque.venueId !== venueScopeId) throw notFound('Event not found');
      return finalizeAuditEvent({
        id: eventId,
        type,
        action: type,
        at: row.processedAt.toISOString(),
        venueId: row.cheque.venueId,
        chequeId: row.chequeId,
        chequeNumber: row.cheque.chequeNumber,
        tableLabel: row.cheque.tableLabel,
        amount: Number(row.amount),
        method: row.method,
        reason: row.reason,
        initiator: row.initiator.username,
        approver: row.approver.username,
        actor: row.approver.username,
        manager: row.approver.username,
        summary: row.reason,
        detail: row.method,
        entityType: 'cheque',
        entityId: row.chequeId,
        shiftId: row.shiftId,
      });
    }

    if (type === 'comp') {
      const row = await prisma.orderItemCompAudit.findUnique({
        where: { id },
        include: {
          cheque: { select: { id: true, chequeNumber: true, tableLabel: true, venueId: true } },
          orderItem: { include: { menuItem: { select: { nameEn: true } } } },
          cashier: { select: { username: true } },
          approver: { select: { username: true } },
        },
      });
      if (!row) throw notFound('Event not found');
      if (venueScopeId && row.cheque.venueId !== venueScopeId) throw notFound('Event not found');
      return finalizeAuditEvent({
        id: eventId,
        type,
        action: type,
        at: row.createdAt.toISOString(),
        venueId: row.cheque.venueId,
        chequeId: row.chequeId,
        chequeNumber: row.cheque.chequeNumber,
        tableLabel: row.cheque.tableLabel,
        itemName: row.orderItem.menuItem.nameEn,
        reason: row.reason,
        cashier: row.cashier.username,
        approver: row.approver.username,
        actor: row.approver.username,
        manager: row.approver.username,
        summary: row.reason,
        detail: row.orderItem.menuItem.nameEn,
        entityType: 'cheque',
        entityId: row.chequeId,
      });
    }

    if (type === 'void') {
      const row = await prisma.orderVoidAudit.findUnique({
        where: { id },
        include: {
          order: {
            select: {
              orderNumber: true,
              tableLabel: true,
              venueId: true,
              chequeLink: {
                select: {
                  chequeId: true,
                  cheque: { select: { chequeNumber: true, tableLabel: true } },
                },
              },
            },
          },
          cashier: { select: { username: true } },
          approver: { select: { username: true } },
        },
      });
      if (!row) throw notFound('Event not found');
      if (venueScopeId && row.order.venueId !== venueScopeId) throw notFound('Event not found');
      const chequeId = row.order.chequeLink?.chequeId ?? null;
      return finalizeAuditEvent({
        id: eventId,
        type,
        action: type,
        at: row.createdAt.toISOString(),
        venueId: row.order.venueId,
        chequeId,
        chequeNumber: row.order.chequeLink?.cheque?.chequeNumber ?? null,
        tableLabel: row.order.tableLabel ?? row.order.chequeLink?.cheque?.tableLabel ?? null,
        orderNumber: row.order.orderNumber,
        reason: row.reason,
        cashier: row.cashier.username,
        approver: row.approver.username,
        actor: row.approver.username,
        manager: row.approver.username,
        summary: row.reason,
        detail: `Round #${row.order.orderNumber}`,
        entityType: chequeId ? 'cheque' : 'order',
        entityId: chequeId ?? row.orderId,
      });
    }

    if (type === 'transfer') {
      const row = await prisma.chequeItemTransferAudit.findUnique({
        where: { id },
        include: {
          sourceCheque: { select: { id: true, chequeNumber: true, tableLabel: true, venueId: true } },
          targetCheque: { select: { id: true, chequeNumber: true, tableLabel: true } },
          orderItem: { include: { menuItem: { select: { nameEn: true } } } },
          cashier: { select: { username: true } },
          approver: { select: { username: true } },
        },
      });
      if (!row) throw notFound('Event not found');
      if (venueScopeId && row.sourceCheque.venueId !== venueScopeId) throw notFound('Event not found');
      return finalizeAuditEvent({
        id: eventId,
        type,
        action: type,
        at: row.createdAt.toISOString(),
        venueId: row.sourceCheque.venueId,
        chequeId: row.sourceChequeId,
        targetChequeId: row.targetChequeId,
        chequeNumber: row.sourceCheque.chequeNumber,
        targetChequeNumber: row.targetCheque.chequeNumber,
        tableLabel: row.sourceCheque.tableLabel,
        targetTable: row.targetCheque.tableLabel,
        itemName: row.orderItem.menuItem?.nameEn ?? null,
        reason: row.reason,
        cashier: row.cashier.username,
        approver: row.approver.username,
        actor: row.approver.username,
        manager: row.approver.username,
        summary: row.reason ?? `Transfer to #${row.targetCheque.chequeNumber}`,
        detail: row.orderItem.menuItem?.nameEn ?? null,
        entityType: 'cheque',
        entityId: row.sourceChequeId,
      });
    }
  }

  if (eventId.startsWith('shift:')) {
    const id = eventId.slice(6);
    const row = await prisma.shiftEvent.findUnique({
      where: { id },
      include: {
        user: { select: { username: true } },
        shift: { select: { id: true, venueId: true } },
      },
    });
    if (!row) throw notFound('Event not found');
    if (venueScopeId && row.shift.venueId !== venueScopeId) throw notFound('Event not found');
    const forced = row.details?.forcedByManager === true;
    return finalizeAuditEvent({
      id: eventId,
      type: forced ? 'shift_force_close' : row.action === 'open' ? 'shift_open' : 'shift_close',
      action: forced ? 'shift.force_close' : `shift.${row.action}`,
      at: row.createdAt.toISOString(),
      venueId: row.shift.venueId,
      shiftId: row.shift.id,
      actor: row.user.username,
      summary: forced ? 'Shift force-closed by manager' : `Shift ${row.action}`,
      details: row.details,
      manager: row.user.username,
      detail: forced ? 'Shift force-closed by manager' : `Shift ${row.action}`,
      amount: row.details?.overShortAmount ?? null,
      reason: forced ? 'Manager force-close' : null,
    });
  }

  throw notFound('Event not found');
}

export async function listFullAuditLog(venueId, filters = {}) {
  const page = Math.max(1, Number(filters.page ?? 1));
  const limit = Math.min(PAGE_SIZE, Math.max(1, Number(filters.limit ?? PAGE_SIZE)));

  let merged;
  if (!venueId) {
    const venues = await prisma.venue.findMany({
      select: { id: true, nameEn: true },
      orderBy: { nameEn: 'asc' },
    });
    const batches = await Promise.all(
      venues.map(async (venue) => {
        const [logRows, domainRows, configRows, shiftRows] = await Promise.all([
          fetchAuditLogRows(venue.id, filters),
          fetchDomainActivity(venue.id, filters),
          fetchConfigAudits(venue.id, filters),
          fetchShiftEvents(venue.id, filters),
        ]);
        const tagVenue = (rows) =>
          rows.map((row) => ({ ...row, venueId: row.venueId ?? venue.id, venueName: venue.nameEn }));
        return [...tagVenue(logRows), ...tagVenue(domainRows), ...tagVenue(configRows), ...tagVenue(shiftRows)];
      }),
    );
    merged = batches.flat();
  } else {
    const [logRows, domainRows, configRows, shiftRows] = await Promise.all([
      fetchAuditLogRows(venueId, filters),
      fetchDomainActivity(venueId, filters),
      fetchConfigAudits(venueId, filters),
      fetchShiftEvents(venueId, filters),
    ]);
    merged = [...logRows, ...domainRows, ...configRows, ...shiftRows];
  }

  merged.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  const seen = new Set();
  const unique = merged.filter((ev) => {
    const key = `${ev.action}:${ev.at}:${ev.summary}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const total = unique.length;
  const start = (page - 1) * limit;
  return {
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
    events: unique.slice(start, start + limit),
  };
}

export function auditLogToCsv(result) {
  const lines = ['at,type,action,actor,summary,venue_id,entity_id'];
  for (const ev of result.events) {
    lines.push(
      [
        csvEscape(ev.at),
        csvEscape(ev.type),
        csvEscape(ev.action),
        csvEscape(ev.actor ?? ev.manager),
        csvEscape(ev.summary ?? ev.detail),
        csvEscape(ev.venueId),
        csvEscape(ev.entityId),
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
