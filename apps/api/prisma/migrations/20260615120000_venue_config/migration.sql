-- CreateEnum
CREATE TYPE "ReceiptTemplate" AS ENUM ('standard', 'compact', 'detailed');

-- AlterTable
ALTER TABLE "venues" ADD COLUMN "tax_rate" DECIMAL(5,4) NOT NULL DEFAULT 0;
ALTER TABLE "venues" ADD COLUMN "tax_inclusive" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "venues" ADD COLUMN "receipt_template" "ReceiptTemplate" NOT NULL DEFAULT 'standard';
ALTER TABLE "venues" ADD COLUMN "kitchen_printer_host" VARCHAR(255);
ALTER TABLE "venues" ADD COLUMN "kitchen_printer_port" INTEGER NOT NULL DEFAULT 9100;
ALTER TABLE "venues" ADD COLUMN "receipt_printer_host" VARCHAR(255);
ALTER TABLE "venues" ADD COLUMN "receipt_printer_port" INTEGER NOT NULL DEFAULT 9100;
ALTER TABLE "venues" ADD COLUMN "table_layout" JSONB;

-- CreateTable
CREATE TABLE "venue_config_audits" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "venue_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "changes" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "venue_config_audits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_venue_config_audit_venue" ON "venue_config_audits"("venue_id");

-- AddForeignKey
ALTER TABLE "venue_config_audits" ADD CONSTRAINT "venue_config_audits_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "venue_config_audits" ADD CONSTRAINT "venue_config_audits_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
