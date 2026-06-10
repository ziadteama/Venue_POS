-- Per-venue business-day numbering for orders and cheques (resets at venue day boundary).

ALTER TABLE "orders" ADD COLUMN "business_date" DATE;

UPDATE "orders"
SET "business_date" = (timezone('UTC', "opened_at"))::date
WHERE "business_date" IS NULL;

ALTER TABLE "orders" ALTER COLUMN "business_date" SET NOT NULL;

DROP INDEX IF EXISTS "uq_orders_venue_number";
CREATE UNIQUE INDEX "uq_orders_venue_business_day_number"
  ON "orders"("venue_id", "business_date", "order_number");
CREATE INDEX "idx_orders_venue_business_date"
  ON "orders"("venue_id", "business_date");

ALTER TABLE "cheques" ADD COLUMN "business_date" DATE;

UPDATE "cheques"
SET "business_date" = (timezone('UTC', "opened_at"))::date
WHERE "business_date" IS NULL;

ALTER TABLE "cheques" ALTER COLUMN "business_date" SET NOT NULL;

DROP INDEX IF EXISTS "uq_cheques_venue_number";
CREATE UNIQUE INDEX "uq_cheques_venue_business_day_number"
  ON "cheques"("venue_id", "business_date", "cheque_number");
CREATE INDEX "idx_cheques_venue_business_date"
  ON "cheques"("venue_id", "business_date");
