import { setAgentMeta, getAgentMeta } from './terminal-cache.js';

export function cacheActiveShift(db, cashierId, shift) {
  setAgentMeta(db, `shift:${cashierId}`, JSON.stringify(shift));
}

export function getCachedShift(db, cashierId) {
  const raw = getAgentMeta(db, `shift:${cashierId}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function clearCachedShift(db, cashierId) {
  db.prepare(`DELETE FROM agent_meta WHERE key = ?`).run(`shift:${cashierId}`);
}
