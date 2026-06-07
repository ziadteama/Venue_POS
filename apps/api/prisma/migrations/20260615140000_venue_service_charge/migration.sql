-- AlterTable
ALTER TABLE "venues" ADD COLUMN "service_rate" DECIMAL(5,4) NOT NULL DEFAULT 0;
ALTER TABLE "venues" ADD COLUMN "service_enabled" BOOLEAN NOT NULL DEFAULT false;
