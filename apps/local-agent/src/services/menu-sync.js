export async function syncMenuFromServer({ db, apiUrl, venueId, terminalId, terminalSecret }) {
  const res = await fetch(`${apiUrl}/api/v1/venues/${venueId}/menu`, {
    headers: {
      'x-terminal-id': terminalId,
      'x-terminal-secret': terminalSecret,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Menu sync failed (${res.status}): ${text}`);
  }

  const menu = await res.json();
  const cached = db
    .prepare('SELECT version_hash AS versionHash FROM menu_cache WHERE venue_id = ?')
    .get(venueId);

  if (cached?.versionHash === menu.versionHash) {
    return { updated: false, menu };
  }

  db.prepare(
    `INSERT INTO menu_cache (venue_id, version_hash, menu_json, synced_at)
     VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(venue_id) DO UPDATE SET
       version_hash = excluded.version_hash,
       menu_json = excluded.menu_json,
       synced_at = excluded.synced_at`,
  ).run(venueId, menu.versionHash, JSON.stringify(menu));

  db.prepare(
    `INSERT INTO agent_meta (key, value) VALUES ('menu_stale', 'false')
     ON CONFLICT(key) DO UPDATE SET value = 'false'`,
  ).run();

  return { updated: true, menu };
}

export function getCachedMenu(db, venueId) {
  const row = db
    .prepare('SELECT menu_json AS menuJson, version_hash AS versionHash, synced_at AS syncedAt FROM menu_cache WHERE venue_id = ?')
    .get(venueId);
  if (!row) return null;
  return {
    ...JSON.parse(row.menuJson),
    syncedAt: row.syncedAt,
  };
}
