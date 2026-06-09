-- Phase 6: sync idempotency, LAN coordinator terminal, hub floor tables

ALTER TABLE "terminals" ADD COLUMN "is_coordinator" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "terminals" ADD COLUMN "coordinator_lan_host" VARCHAR(255);

CREATE TABLE "sync_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sync_id" UUID NOT NULL,
    "terminal_id" UUID NOT NULL,
    "event_type" VARCHAR(100) NOT NULL,
    "result_json" JSONB,
    "processed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sync_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "sync_events_sync_id_key" ON "sync_events"("sync_id");
CREATE INDEX "idx_sync_events_terminal" ON "sync_events"("terminal_id");

ALTER TABLE "sync_events" ADD CONSTRAINT "sync_events_terminal_id_fkey" FOREIGN KEY ("terminal_id") REFERENCES "terminals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "floor_tables" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "table_label" VARCHAR(50) NOT NULL,
    "venue_id" UUID,
    "occupied_by_cheque_id" UUID,
    "locked_by_terminal_id" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "floor_tables_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "floor_tables_table_label_key" ON "floor_tables"("table_label");
CREATE INDEX "idx_floor_tables_venue" ON "floor_tables"("venue_id");

ALTER TABLE "floor_tables" ADD CONSTRAINT "floor_tables_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE SET NULL ON UPDATE CASCADE;
