CREATE TABLE "ops_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "type" VARCHAR(64) NOT NULL,
    "severity" VARCHAR(16) NOT NULL,
    "source" VARCHAR(64),
    "venue_id" UUID,
    "terminal_id" UUID,
    "title" VARCHAR(200) NOT NULL,
    "message" VARCHAR(1000) NOT NULL,
    "details" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ops_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_ops_events_created" ON "ops_events"("created_at");
CREATE INDEX "idx_ops_events_type_at" ON "ops_events"("type", "created_at");

ALTER TABLE "ops_events" ADD CONSTRAINT "ops_events_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ops_events" ADD CONSTRAINT "ops_events_terminal_id_fkey" FOREIGN KEY ("terminal_id") REFERENCES "terminals"("id") ON DELETE SET NULL ON UPDATE CASCADE;
