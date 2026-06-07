import os from 'os';
import { prisma } from '../db/prisma.js';

const OFFLINE_THRESHOLD_MS = 5 * 60 * 1000;

function countSocketClients(io, venueId) {
  if (!io?.sockets?.sockets) {
    return { total: 0, terminals: 0, dashboards: 0, pos: 0 };
  }

  let terminals = 0;
  let dashboards = 0;

  for (const socket of io.sockets.sockets.values()) {
    const terminal = socket.data?.terminal;
    const role = socket.data?.role;
    const clientType = socket.data?.clientType ?? 'pos';

    if (terminal) {
      if (venueId && terminal.venueId !== venueId) continue;
      if (clientType === 'kds') continue;
      terminals += 1;
      continue;
    }

    if (role === 'hub_owner' || role === 'hub_manager') {
      if (venueId && socket.data?.user?.venue_id && socket.data.user.venue_id !== venueId) {
        continue;
      }
      dashboards += 1;
    }
  }

  return { total: terminals + dashboards, terminals, dashboards, pos: terminals };
}

export async function touchTerminalSeen(terminalId, { syncQueueDepth } = {}) {
  const data = { lastSeenAt: new Date() };
  if (syncQueueDepth != null && Number.isFinite(Number(syncQueueDepth))) {
    data.syncQueueDepth = Math.max(0, Math.floor(Number(syncQueueDepth)));
  }
  await prisma.terminal.update({ where: { id: terminalId }, data });
}

export async function getSystemHealth(venueId, io) {
  const now = Date.now();
  const terminals = await prisma.terminal.findMany({
    where: { ...(venueId ? { venueId } : {}), isActive: true },
    include: { venue: { select: { id: true, nameEn: true, nameAr: true } } },
    orderBy: { name: 'asc' },
  });

  const terminalRows = terminals.map((t) => {
    const lastSeenMs = t.lastSeenAt?.getTime() ?? null;
    const online = lastSeenMs != null && now - lastSeenMs < OFFLINE_THRESHOLD_MS;
    return {
      id: t.id,
      name: t.name,
      venueId: t.venueId,
      venueNameEn: t.venue.nameEn,
      venueNameAr: t.venue.nameAr,
      lastSeenAt: t.lastSeenAt?.toISOString() ?? null,
      syncQueueDepth: t.syncQueueDepth ?? 0,
      online,
      offlineMinutes:
        lastSeenMs != null ? Math.max(0, Math.floor((now - lastSeenMs) / 60000)) : null,
      alert: !online,
    };
  });

  const freeMem = os.freemem();
  const totalMem = os.totalmem();

  return {
    checkedAt: new Date().toISOString(),
    venueId: venueId ?? null,
    server: {
      uptimeSeconds: Math.floor(os.uptime()),
      memoryUsedMb: Math.round((totalMem - freeMem) / 1024 / 1024),
      memoryTotalMb: Math.round(totalMem / 1024 / 1024),
      memoryUsedPercent: Math.round(((totalMem - freeMem) / totalMem) * 100),
      loadAvg: os.loadavg().map((n) => Number(n.toFixed(2))),
      platform: os.platform(),
    },
    terminals: terminalRows,
    summary: {
      terminalCount: terminalRows.length,
      onlineCount: terminalRows.filter((t) => t.online).length,
      offlineCount: terminalRows.filter((t) => !t.online).length,
      pendingSyncTotal: terminalRows.reduce((sum, t) => sum + (t.syncQueueDepth ?? 0), 0),
      wsConnections: countSocketClients(io, venueId),
    },
    alerts: terminalRows
      .filter((t) => t.alert)
      .map((t) => ({
        type: 'terminal_offline',
        terminalId: t.id,
        terminalName: t.name,
        message: `${t.name ?? t.id} offline${t.offlineMinutes != null ? ` for ${t.offlineMinutes}m` : ''}`,
      })),
  };
}

export function healthSnapshotToCsv(snapshot) {
  const lines = ['terminal,name,venue,online,last_seen,sync_queue_depth,offline_minutes'];
  for (const t of snapshot.terminals) {
    lines.push(
      [
        csvEscape(t.id),
        csvEscape(t.name),
        csvEscape(t.venueNameEn),
        t.online,
        csvEscape(t.lastSeenAt),
        t.syncQueueDepth,
        t.offlineMinutes ?? '',
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
