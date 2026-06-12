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
      floor_table_id TEXT,
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
      floor_table_id TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      opened_at TEXT NOT NULL,
      synced_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS floor_locks (
      table_label TEXT PRIMARY KEY,
      floor_table_id TEXT,
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
    CREATE TABLE IF NOT EXISTS staff_cache (
      id TEXT PRIMARY KEY,
      username TEXT,
      role TEXT NOT NULL,
      pin_hash TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS features_cache (
      venue_id TEXT PRIMARY KEY,
      features_json TEXT NOT NULL,
      synced_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS menu_publish_queue (
      id TEXT PRIMARY KEY,
      version_hash TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS linked_menu_cache (
      venue_id TEXT PRIMARY KEY,
      version_hash TEXT NOT NULL,
      menu_json TEXT NOT NULL,
      synced_at TEXT NOT NULL
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
  try {
    db.exec(`ALTER TABLE cheques ADD COLUMN parent_cheque_id TEXT`);
  } catch {
    /* column exists */
  }
  try {
    db.exec(`ALTER TABLE cheques ADD COLUMN split_label TEXT`);
  } catch {
    /* column exists */
  }
  try {
    db.exec(`ALTER TABLE order_items ADD COLUMN billing_cheque_id TEXT`);
  } catch {
    /* column exists */
  }
  try {
    db.exec(`ALTER TABLE cheques ADD COLUMN floor_table_id TEXT`);
  } catch {
    /* column exists */
  }
  try {
    db.exec(`ALTER TABLE orders ADD COLUMN floor_table_id TEXT`);
  } catch {
    /* column exists */
  }
  try {
    db.exec(`ALTER TABLE floor_locks ADD COLUMN floor_table_id TEXT`);
  } catch {
    /* column exists */
  }
  try {
    db.exec(`ALTER TABLE cheques ADD COLUMN service_mode TEXT NOT NULL DEFAULT 'dine_in'`);
  } catch {
    /* column exists */
  }
  try {
    db.exec(`ALTER TABLE cheques ADD COLUMN pre_payment_check_print_count INTEGER NOT NULL DEFAULT 0`);
  } catch {
    /* column exists */
  }
}
