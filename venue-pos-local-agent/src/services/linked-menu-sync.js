import { apiFetch } from './api-fetch.js';

export async function syncLinkedMenusFromServer({
  db,
  apiUrl,
  terminalId,
  terminalSecret,
  targetVenueIds = [],
}) {
  const results = [];
  for (const targetVenueId of targetVenueIds) {
    try {
      const menu = await apiFetch(
        apiUrl,
        terminalId,
        terminalSecret,
        `/api/v1/venues/${targetVenueId}/menu`,
      );
      db.prepare(
        `INSERT INTO linked_menu_cache (venue_id, version_hash, menu_json, synced_at)
         VALUES (?, ?, ?, datetime('now'))
         ON CONFLICT(venue_id) DO UPDATE SET
           version_hash = excluded.version_hash,
           menu_json = excluded.menu_json,
           synced_at = excluded.synced_at`,
      ).run(targetVenueId, menu.versionHash, JSON.stringify(menu));
      results.push({ venueId: targetVenueId, updated: true });
    } catch (err) {
      results.push({ venueId: targetVenueId, error: err.message });
    }
  }
  return results;
}

export function getLinkedMenuCache(db, venueId) {
  const row = db
    .prepare(`SELECT menu_json FROM linked_menu_cache WHERE venue_id = ?`)
    .get(venueId);
  if (!row) return null;
  return JSON.parse(row.menu_json);
}
