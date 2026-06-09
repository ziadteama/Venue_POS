export function initSchema(db) {
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
    CREATE TABLE IF NOT EXISTS menu_cache (
      venue_id TEXT PRIMARY KEY,
      version_hash TEXT NOT NULL,
      menu_json TEXT NOT NULL,
      synced_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS cheques (
      id TEXT PRIMARY KEY,
      server_id TEXT,
      venue_id TEXT NOT NULL,
      cashier_id TEXT NOT NULL,
      terminal_id TEXT,
      table_label TEXT NOT NULL,
      cheque_number INTEGER,
      status TEXT NOT NULL DEFAULT 'open',
      discount_amount REAL NOT NULL DEFAULT 0,
      tax_amount REAL NOT NULL DEFAULT 0,
      service_amount REAL NOT NULL DEFAULT 0,
      total REAL NOT NULL DEFAULT 0,
      opened_at TEXT NOT NULL,
      closed_at TEXT,
      synced_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      server_id TEXT,
      cheque_id TEXT,
      venue_id TEXT NOT NULL,
      cashier_id TEXT NOT NULL,
      terminal_id TEXT,
      order_number INTEGER,
      table_label TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      opened_at TEXT NOT NULL,
      synced_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS floor_locks (
      table_label TEXT PRIMARY KEY,
      cheque_id TEXT,
      terminal_id TEXT,
      venue_id TEXT,
      locked_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS cross_venue_groups (
      id TEXT PRIMARY KEY,
      anchor_cheque_id TEXT NOT NULL,
      anchor_venue_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      group_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS order_items (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      menu_item_id TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      unit_price REAL NOT NULL,
      name_en TEXT NOT NULL,
      name_ar TEXT NOT NULL,
      modifiers_json TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (order_id) REFERENCES orders(id)
    );
  `);

  try {
    db.exec(`ALTER TABLE orders ADD COLUMN cheque_id TEXT`);
  } catch {
    /* column exists */
  }
}
