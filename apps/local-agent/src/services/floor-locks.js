import { randomUUID } from 'node:crypto';

export function listFloorLocks(db) {
  return db
    .prepare(`SELECT table_label, cheque_id, terminal_id, venue_id, locked_at FROM floor_locks ORDER BY table_label`)
    .all()
    .map((row) => ({
      tableLabel: row.table_label,
      chequeId: row.cheque_id,
      terminalId: row.terminal_id,
      venueId: row.venue_id,
      lockedAt: row.locked_at,
      isOccupied: Boolean(row.cheque_id),
    }));
}

export function occupyFloorLock(db, { tableLabel, chequeId, terminalId, venueId }) {
  const trimmed = tableLabel?.trim();
  if (!trimmed) throw new Error('tableLabel required');

  const existing = db.prepare(`SELECT * FROM floor_locks WHERE table_label = ?`).get(trimmed);
  if (existing?.cheque_id && existing.cheque_id !== chequeId) {
    throw new Error('Table is occupied on coordinator');
  }

  db.prepare(
    `INSERT INTO floor_locks (table_label, cheque_id, terminal_id, venue_id, locked_at)
     VALUES (?, ?, ?, ?, datetime('now'))
     ON CONFLICT(table_label) DO UPDATE SET
       cheque_id = excluded.cheque_id,
       terminal_id = excluded.terminal_id,
       venue_id = excluded.venue_id,
       locked_at = datetime('now')`,
  ).run(trimmed, chequeId ?? null, terminalId ?? null, venueId ?? null);

  return listFloorLocks(db).find((t) => t.tableLabel === trimmed);
}

export function releaseFloorLock(db, { tableLabel, chequeId }) {
  const trimmed = tableLabel?.trim();
  if (!trimmed) return null;
  const existing = db.prepare(`SELECT * FROM floor_locks WHERE table_label = ?`).get(trimmed);
  if (!existing) return null;
  if (chequeId && existing.cheque_id && existing.cheque_id !== chequeId) {
    return listFloorLocks(db).find((t) => t.tableLabel === trimmed);
  }
  db.prepare(`DELETE FROM floor_locks WHERE table_label = ?`).run(trimmed);
  return { tableLabel: trimmed, isOccupied: false };
}

export function ensureFloorLockTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS floor_locks (
      table_label TEXT PRIMARY KEY,
      cheque_id TEXT,
      terminal_id TEXT,
      venue_id TEXT,
      locked_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

export function newCoordinatorGroupId() {
  return randomUUID();
}
