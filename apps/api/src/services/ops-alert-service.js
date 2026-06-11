import {
  OPS_EVENT_TYPES,
  OPS_MEMORY_WARN_PERCENT,
  OPS_SEVERITY,
  OPS_SYNC_QUEUE_WARN,
} from '@venue-pos/shared';
import { prisma } from '../db/prisma.js';
import { getSystemHealth } from './manager-health-service.js';
import { emitOpsAlert, emitOpsHealthTick } from '../plugins/socket.js';

const recentAlertAt = new Map();

function dedupeKey(type, venueId, terminalId) {
  return [type, venueId ?? '', terminalId ?? ''].join(':');
}

function shouldEmit(type, venueId, terminalId) {
  const key = dedupeKey(type, venueId, terminalId);
  const last = recentAlertAt.get(key) ?? 0;
  if (Date.now() - last < 15 * 60 * 1000) return false;
  recentAlertAt.set(key, Date.now());
  return true;
}

function serializeEvent(row) {
  return {
    id: row.id,
    type: row.type,
    severity: row.severity,
    source: row.source,
    venueId: row.venueId,
    terminalId: row.terminalId,
    title: row.title,
    message: row.message,
    details: row.details ?? null,
    createdAt: row.createdAt.toISOString(),
    venueNameEn: row.venue?.nameEn ?? null,
    venueNameAr: row.venue?.nameAr ?? null,
    terminalName: row.terminal?.name ?? null,
  };
}

export async function recordOpsEvent(io, input) {
  const row = await prisma.opsEvent.create({
    data: {
      type: input.type,
      severity: input.severity ?? OPS_SEVERITY.WARNING,
      source: input.source ?? 'api',
      venueId: input.venueId ?? null,
      terminalId: input.terminalId ?? null,
      title: input.title.slice(0, 200),
      message: input.message.slice(0, 1000),
      details: input.details ?? undefined,
    },
    include: {
      venue: { select: { nameEn: true, nameAr: true } },
      terminal: { select: { name: true } },
    },
  });

  const event = serializeEvent(row);
  emitOpsAlert(io, event);
  return event;
}

export async function listOpsEvents({ limit = 50, since, type } = {}) {
  const rows = await prisma.opsEvent.findMany({
    where: {
      ...(type ? { type } : {}),
      ...(since ? { createdAt: { gte: new Date(since) } } : {}),
    },
    include: {
      venue: { select: { nameEn: true, nameAr: true } },
      terminal: { select: { name: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: Math.min(Math.max(limit, 1), 200),
  });
  return rows.map(serializeEvent);
}

export async function getOpsDashboard(io) {
  const [health, events] = await Promise.all([
    getSystemHealth(null, io),
    listOpsEvents({ limit: 40 }),
  ]);

  return {
    checkedAt: new Date().toISOString(),
    health,
    events,
    summary: {
      openAlerts: health.alerts?.length ?? 0,
      criticalEvents24h: events.filter((e) => e.severity === OPS_SEVERITY.CRITICAL).length,
      offlineTerminals: health.summary?.offlineCount ?? 0,
      pendingSyncTotal: health.summary?.pendingSyncTotal ?? 0,
    },
  };
}

export async function scanAndEmitOpsAlerts(io) {
  const health = await getSystemHealth(null, io);
  emitOpsHealthTick(io, health);

  const terminalById = new Map((health.terminals ?? []).map((t) => [t.id, t]));

  for (const alert of health.alerts ?? []) {
    const term = terminalById.get(alert.terminalId);
    if (!shouldEmit(OPS_EVENT_TYPES.TERMINAL_OFFLINE, term?.venueId, alert.terminalId)) continue;
    await recordOpsEvent(io, {
      type: OPS_EVENT_TYPES.TERMINAL_OFFLINE,
      severity: OPS_SEVERITY.WARNING,
      source: 'health',
      venueId: term?.venueId ?? null,
      terminalId: alert.terminalId,
      title: 'Terminal offline',
      message: alert.message,
      details: { terminalName: alert.terminalName },
    });
  }

  for (const term of health.terminals ?? []) {
    if (term.syncQueueDepth >= OPS_SYNC_QUEUE_WARN) {
      if (!shouldEmit(OPS_EVENT_TYPES.SYNC_QUEUE_HIGH, term.venueId, term.id)) continue;
      await recordOpsEvent(io, {
        type: OPS_EVENT_TYPES.SYNC_QUEUE_HIGH,
        severity: OPS_SEVERITY.WARNING,
        source: 'health',
        venueId: term.venueId,
        terminalId: term.id,
        title: 'High sync queue',
        message: `${term.name ?? term.id} has ${term.syncQueueDepth} pending sync events`,
        details: { syncQueueDepth: term.syncQueueDepth },
      });
    }
  }

  const memPct = health.server?.memoryUsedPercent ?? 0;
  if (memPct >= OPS_MEMORY_WARN_PERCENT) {
    if (shouldEmit(OPS_EVENT_TYPES.SERVER_MEMORY_HIGH, null, null)) {
      await recordOpsEvent(io, {
        type: OPS_EVENT_TYPES.SERVER_MEMORY_HIGH,
        severity: memPct >= 95 ? OPS_SEVERITY.CRITICAL : OPS_SEVERITY.WARNING,
        source: 'health',
        title: 'High server memory',
        message: `API server memory at ${memPct}%`,
        details: health.server,
      });
    }
  }

  return health;
}
