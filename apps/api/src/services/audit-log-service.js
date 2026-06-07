import { prisma } from '../db/prisma.js';
import { validationError } from '../utils/errors.js';
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

async function fetchAuditLogRows(venueId, filters) {
  const where = {};
  if (venueId) where.venueId = venueId;
  if (filters.type && filters.type !== 'all') {
    where.action = filters.type.includes('.') ? filters.type : { startsWith: filters.type };
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

  return rows.map((row) => ({
    id: `log:${row.id}`,
    type: row.action.split('.')[0] ?? row.action,
    action: row.action,
    at: row.createdAt.toISOString(),
    venueId: row.venueId,
    actor: row.actorUsername,
    summary: row.summary,
    entityType: row.entityType,
    entityId: row.entityId,
    details: row.details,
    chequeNumber: row.details?.chequeNumber ?? null,
    tableLabel: row.details?.tableLabel ?? null,
    amount: row.details?.amount ?? null,
    reason: row.details?.reason ?? null,
    manager: row.actorUsername,
    detail: row.summary,
  }));
}

async function fetchDomainActivity(venueId, filters) {
  if (filters.type && filters.type !== 'all' && !DOMAIN_TYPES.has(filters.type)) return [];
  const events = await listManagerActivity(venueId, { limit: 200 });
  let filtered = events;
  if (filters.type && filters.type !== 'all') {
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
  return filtered.map((ev) => ({
    ...ev,
    id: `domain:${ev.type}:${ev.id}`,
    action: ev.type,
    actor: ev.manager,
    summary: ev.detail ?? ev.reason ?? ev.type,
  }));
}

async function fetchConfigAudits(venueId, filters) {
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
    !['shift', 'shift_open', 'shift_close'].includes(filters.type)
  ) {
    return [];
  }
  const where = { shift: { venueId } };
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

  return rows.map((row) => ({
    id: `shift:${row.id}`,
    type: row.action === 'open' ? 'shift_open' : 'shift_close',
    action: `shift.${row.action}`,
    at: row.createdAt.toISOString(),
    venueId,
    actor: row.user.username,
    summary: `Shift ${row.action}`,
    details: row.details,
    manager: row.user.username,
    detail: `Shift ${row.action}`,
  }));
}

export async function listFullAuditLog(venueId, filters = {}) {
  const page = Math.max(1, Number(filters.page ?? 1));
  const limit = Math.min(PAGE_SIZE, Math.max(1, Number(filters.limit ?? PAGE_SIZE)));

  const [logRows, domainRows, configRows, shiftRows] = await Promise.all([
    fetchAuditLogRows(venueId, filters),
    venueId ? fetchDomainActivity(venueId, filters) : [],
    venueId ? fetchConfigAudits(venueId, filters) : [],
    venueId ? fetchShiftEvents(venueId, filters) : [],
  ]);

  const merged = [...logRows, ...domainRows, ...configRows, ...shiftRows].sort(
    (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
  );

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
