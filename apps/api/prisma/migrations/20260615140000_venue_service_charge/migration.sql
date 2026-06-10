-- AlterTable
ALTER TABLE "venues" ADD COLUMN "service_rate" DECIMAL(5,4) NOT NULL DEFAULT 0;
ALTER TABLE "venues" ADD COLUMN "service_enabled" BOOLEAN NOT NULL DEFAULT false;

-- Backfill hub_billing from anchor (or first) venue now that venue columns exist.
UPDATE "hub_billing" hb
SET
    "tax_rate" = src."tax_rate",
    "tax_inclusive" = src."tax_inclusive",
    "service_rate" = src."service_rate",
    "service_enabled" = src."service_enabled",
    "updated_at" = NOW()
FROM (
    SELECT
        v."tax_rate",
        v."tax_inclusive",
        v."service_rate",
        v."service_enabled"
    FROM "venues" v
    WHERE v."is_active" = true
    ORDER BY CASE WHEN v."type" = 'anchor' THEN 0 ELSE 1 END, v."created_at" ASC
    LIMIT 1
) src
WHERE hb."id" = 'hub';
