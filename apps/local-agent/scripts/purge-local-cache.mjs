/**
 * Dev-only: clear local SQLite operational cache (cheques, orders, sync queue, shifts).
 * Keeps menu/staff/features cache.
 *
 * Usage: node scripts/purge-local-cache.mjs
 */
import Database from 'better-sqlite3';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.SQLITE_PATH ?? resolve(__dirname, '../data/local.db');

if (!existsSync(dbPath)) {
  console.log(`No local agent DB at ${dbPath} — nothing to purge.`);
  process.exit(0);
}

const db = new Database(dbPath);

const tables = [
  'order_items',
  'orders',
  'cheques',
  'cross_venue_groups',
  'floor_locks',
  'sync_queue',
  'menu_publish_queue',
];

const metaPrefixes = ['shift:', 'shift_map:'];

db.transaction(() => {
  for (const table of tables) {
    db.prepare(`DELETE FROM ${table}`).run();
  }
  for (const prefix of metaPrefixes) {
    db.prepare(`DELETE FROM agent_meta WHERE key LIKE ?`).run(`${prefix}%`);
  }
})();

console.log(`Purged local agent cache: ${dbPath}`);
