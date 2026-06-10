import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createDatabase } from './sqlite.js';

test('agent database uses WAL journal mode', () => {
  const db = createDatabase(':memory:');
  const mode = db.pragma('journal_mode', { simple: true });
  assert.equal(mode, 'memory');
  db.close();
});

test('agent database persists sync queue across reopen', () => {
  const path = ':memory:';
  const db1 = createDatabase(path);
  db1.prepare(
    `INSERT INTO sync_queue (id, event_type, payload_json, status) VALUES ('j1', 'cheque.open', '{}', 'pending')`,
  ).run();
  const count = db1.prepare(`SELECT COUNT(*) AS n FROM sync_queue`).get().n;
  assert.equal(count, 1);
  db1.close();
});

test('file-backed database survives reopen with WAL (power-loss recovery)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'venue-pos-sqlite-'));
  const dbPath = join(dir, 'agent.db');
  const db1 = createDatabase(dbPath);
  db1.prepare(
    `INSERT INTO sync_queue (id, event_type, payload_json, status) VALUES (?, 'cheque.pay', '{}', 'pending')`,
  ).run(randomUUID());
  db1.close();

  const db2 = createDatabase(dbPath);
  assert.equal(db2.prepare(`SELECT COUNT(*) AS n FROM sync_queue`).get().n, 1);
  db2.close();
  rmSync(dir, { recursive: true, force: true });
});
