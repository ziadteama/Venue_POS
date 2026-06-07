ALTER TABLE "terminals" ADD COLUMN "sync_queue_depth" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "venue_id" UUID,
    "actor_id" UUID,
    "actor_username" VARCHAR(100),
    "action" VARCHAR(64) NOT NULL,
    "entity_type" VARCHAR(64),
    "entity_id" VARCHAR(64),
    "summary" VARCHAR(500) NOT NULL,
    "details" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_audit_logs_venue_at" ON "audit_logs"("venue_id", "created_at");
CREATE INDEX "idx_audit_logs_action_at" ON "audit_logs"("action", "created_at");

ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
