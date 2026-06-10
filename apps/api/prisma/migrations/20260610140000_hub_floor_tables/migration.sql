-- Hub-wide floor table FKs on cheques/orders + cross-venue occupancy metadata

ALTER TABLE "floor_tables" ADD COLUMN IF NOT EXISTS "sort_order" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "floor_tables" ADD COLUMN IF NOT EXISTS "is_active" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "floor_tables" ADD COLUMN IF NOT EXISTS "occupied_cross_venue_group_id" UUID;

ALTER TABLE "cheques" ADD COLUMN IF NOT EXISTS "floor_table_id" UUID;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "floor_table_id" UUID;

CREATE INDEX IF NOT EXISTS "idx_cheques_floor_table_status" ON "cheques"("floor_table_id", "status");
CREATE INDEX IF NOT EXISTS "idx_orders_floor_table" ON "orders"("floor_table_id");

ALTER TABLE "cheques"
  ADD CONSTRAINT "cheques_floor_table_id_fkey"
  FOREIGN KEY ("floor_table_id") REFERENCES "floor_tables"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "orders"
  ADD CONSTRAINT "orders_floor_table_id_fkey"
  FOREIGN KEY ("floor_table_id") REFERENCES "floor_tables"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill floor_tables from existing cheque/order labels
INSERT INTO "floor_tables" ("id", "table_label", "sort_order", "is_active", "updated_at")
SELECT gen_random_uuid(), label, 0, true, NOW()
FROM (
  SELECT DISTINCT TRIM(BOTH FROM label) AS label
  FROM (
    SELECT c.table_label AS label FROM cheques c WHERE c.table_label IS NOT NULL AND TRIM(c.table_label) <> ''
    UNION
    SELECT o.table_label AS label FROM orders o WHERE o.table_label IS NOT NULL AND TRIM(o.table_label) <> ''
  ) raw
  WHERE label IS NOT NULL AND TRIM(label) <> ''
) labels
WHERE NOT EXISTS (
  SELECT 1 FROM floor_tables ft WHERE LOWER(ft.table_label) = LOWER(labels.label)
);

UPDATE cheques c
SET floor_table_id = ft.id
FROM floor_tables ft
WHERE c.floor_table_id IS NULL
  AND LOWER(TRIM(c.table_label)) = LOWER(TRIM(ft.table_label));

UPDATE orders o
SET floor_table_id = ft.id
FROM floor_tables ft
WHERE o.floor_table_id IS NULL
  AND o.table_label IS NOT NULL
  AND LOWER(TRIM(o.table_label)) = LOWER(TRIM(ft.table_label));

UPDATE orders o
SET floor_table_id = c.floor_table_id,
    table_label = COALESCE(o.table_label, c.table_label)
FROM cheque_orders co
JOIN cheques c ON c.id = co.cheque_id
WHERE o.id = co.order_id
  AND o.floor_table_id IS NULL
  AND c.floor_table_id IS NOT NULL;
