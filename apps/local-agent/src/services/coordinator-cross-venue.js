import { randomUUID } from 'node:crypto';

export function saveCoordinatorGroup(db, { groupId, anchorChequeId, anchorVenueId, groupJson }) {
  db.prepare(
    `INSERT INTO cross_venue_groups (id, anchor_cheque_id, anchor_venue_id, status, group_json)
     VALUES (?, ?, ?, 'open', ?)
     ON CONFLICT(id) DO UPDATE SET group_json = excluded.group_json`,
  ).run(groupId, anchorChequeId, anchorVenueId, JSON.stringify(groupJson));
  return getCoordinatorGroup(db, groupId);
}

export function getCoordinatorGroup(db, groupId) {
  const row = db.prepare(`SELECT * FROM cross_venue_groups WHERE id = ?`).get(groupId);
  if (!row) return null;
  return {
    groupId: row.id,
    anchorChequeId: row.anchor_cheque_id,
    anchorVenueId: row.anchor_venue_id,
    status: row.status,
    ...JSON.parse(row.group_json),
  };
}

export function listCoordinatorGroups(db) {
  return db
    .prepare(`SELECT id FROM cross_venue_groups WHERE status = 'open'`)
    .all()
    .map((r) => getCoordinatorGroup(db, r.id))
    .filter(Boolean);
}

export function newGroupId() {
  return randomUUID();
}
