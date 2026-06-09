-- AlterTable
ALTER TABLE "cheques" ADD COLUMN "cross_venue_group_id" UUID;

-- CreateIndex
CREATE INDEX "idx_cheques_cross_group" ON "cheques"("cross_venue_group_id");
