-- CreateEnum
CREATE TYPE "ChequeServiceMode" AS ENUM ('dine_in', 'takeaway');

-- AlterTable
ALTER TABLE "cheques" ADD COLUMN "service_mode" "ChequeServiceMode" NOT NULL DEFAULT 'dine_in';

-- CreateIndex
CREATE INDEX "idx_cheques_venue_service_mode" ON "cheques"("venue_id", "service_mode", "status");
