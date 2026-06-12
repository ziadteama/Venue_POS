import bcrypt from 'bcrypt';
import { DEFAULT_KIOSK_EXIT_PIN, isKioskOverridePin } from '@venue-pos/shared';
import { syncLinkedMenusFromServer } from './linked-menu-sync.js';

export function saveStaffCache(db, staff = []) {
  const tx = db.transaction(() => {
    db.prepare(`DELETE FROM staff_cache`).run();
    const stmt = db.prepare(
      `INSERT INTO staff_cache (id, username, role, pin_hash) VALUES (?, ?, ?, ?)`,
    );
    for (const user of staff) {
      stmt.run(user.id, user.username, user.role, user.pinHash);
    }
  });
  tx();
}

export function saveFeaturesCache(db, venueId, features) {
  db.prepare(
    `INSERT INTO features_cache (venue_id, features_json, synced_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(venue_id) DO UPDATE SET
       features_json = excluded.features_json,
       synced_at = excluded.synced_at`,
  ).run(venueId, JSON.stringify(features));
}

export function getCachedFeatures(db, venueId) {
  const row = db
    .prepare(`SELECT features_json FROM features_cache WHERE venue_id = ?`)
    .get(venueId);
  if (!row) return null;
  return JSON.parse(row.features_json);
}

export function patchFeaturesTables(db, venueId, tables) {
  const cached = getCachedFeatures(db, venueId);
  if (!cached) return false;
  saveFeaturesCache(db, venueId, { ...cached, tables });
  return true;
}

export async function verifyCachedManagerPin(db, pin) {
  if (isKioskOverridePin(pin)) {
    return { id: 'kiosk-override', username: 'kiosk_override', role: 'venue_manager' };
  }
  const rows = db
    .prepare(`SELECT id, username, role, pin_hash FROM staff_cache WHERE role = 'venue_manager'`)
    .all();
  for (const row of rows) {
    if (await bcrypt.compare(pin, row.pin_hash)) {
      return { id: row.id, username: row.username, role: row.role };
    }
  }
  return null;
}

export async function verifyCachedKioskExitPin(db, pin) {
  if (isKioskOverridePin(pin)) {
    return { override: true };
  }
  const hash = getAgentMeta(db, 'kiosk_exit_pin_hash');
  if (!hash) {
    if (String(pin) === DEFAULT_KIOSK_EXIT_PIN) {
      return { override: false };
    }
    return null;
  }
  if (await bcrypt.compare(String(pin), hash)) {
    return { override: false };
  }
  return null;
}

export function setKioskExitPinHash(db, hash) {
  if (hash) setAgentMeta(db, 'kiosk_exit_pin_hash', hash);
}

export async function verifyCachedPin(db, pin) {
  const rows = db.prepare(`SELECT id, username, role, pin_hash FROM staff_cache`).all();
  for (const row of rows) {
    if (await bcrypt.compare(pin, row.pin_hash)) {
      return { id: row.id, username: row.username, role: row.role };
    }
  }
  return null;
}

export function setAgentMeta(db, key, value) {
  db.prepare(
    `INSERT INTO agent_meta (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(key, value);
}

export function getAgentMeta(db, key) {
  return db.prepare(`SELECT value FROM agent_meta WHERE key = ?`).get(key)?.value ?? null;
}

export async function syncTerminalRosterFromServer({ db, apiUrl, venueId, terminalId, terminalSecret }) {
  const res = await fetch(`${apiUrl}/api/v1/terminals/roster`, {
    headers: {
      'x-terminal-id': terminalId,
      'x-terminal-secret': terminalSecret,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Roster sync failed (${res.status}): ${text}`);
  }
  const data = await res.json();
  if (data.staff?.length) saveStaffCache(db, data.staff);
  if (data.features) saveFeaturesCache(db, venueId, data.features);
  if (data.menuVersionHash) setAgentMeta(db, 'menu_version_hash', data.menuVersionHash);
  if (data.terminal?.name) setAgentMeta(db, 'hub_device_label', data.terminal.name);
  if (data.terminal?.kioskExitPinHash) {
    setAgentMeta(db, 'kiosk_exit_pin_hash', data.terminal.kioskExitPinHash);
  }
  if (data.lanConfig) setAgentMeta(db, 'hub_lan_config', JSON.stringify(data.lanConfig));
  setAgentMeta(db, 'last_roster_sync_at', data.syncedAt ?? new Date().toISOString());
  const targets = data.features?.crossVenueTargets ?? [];
  if (targets.length) {
    await syncLinkedMenusFromServer({
      db,
      apiUrl,
      terminalId,
      terminalSecret,
      targetVenueIds: targets.map((t) => t.id),
    });
  }
  return data;
}
