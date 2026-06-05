import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export function createDatabase(dbPath) {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');

  db.exec(`
    CREATE TABLE IF NOT EXISTS sync_queue (
      id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      retry_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS agent_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  return db;
}
