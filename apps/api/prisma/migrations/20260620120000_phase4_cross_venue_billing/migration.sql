-- AlterTable
ALTER TABLE "cheques" ADD COLUMN "is_cross_venue" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "venue_billing_configs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "anchor_venue_id" UUID NOT NULL,
    "target_venue_id" UUID NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "venue_billing_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "uq_venue_billing_pair" ON "venue_billing_configs"("anchor_venue_id", "target_venue_id");

-- CreateIndex
CREATE INDEX "idx_venue_billing_anchor" ON "venue_billing_configs"("anchor_venue_id");

-- CreateIndex
CREATE INDEX "idx_venue_billing_target" ON "venue_billing_configs"("target_venue_id");

-- AddForeignKey
ALTER TABLE "venue_billing_configs" ADD CONSTRAINT "venue_billing_configs_anchor_venue_id_fkey" FOREIGN KEY ("anchor_venue_id") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "venue_billing_configs" ADD CONSTRAINT "venue_billing_configs_target_venue_id_fkey" FOREIGN KEY ("target_venue_id") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE CASCADE;
