-- Hub-wide tax & service (one config for all venues).

CREATE TABLE "hub_billing" (
    "id" VARCHAR(16) NOT NULL,
    "tax_rate" DECIMAL(5,4) NOT NULL DEFAULT 0,
    "tax_inclusive" BOOLEAN NOT NULL DEFAULT false,
    "service_rate" DECIMAL(5,4) NOT NULL DEFAULT 0,
    "service_enabled" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "hub_billing_pkey" PRIMARY KEY ("id")
);

-- Seed defaults only; venue tax/service columns are added in later migrations.
-- Backfill from anchor venue runs in 20260615140000_venue_service_charge.
INSERT INTO "hub_billing" ("id", "tax_rate", "tax_inclusive", "service_rate", "service_enabled", "updated_at")
VALUES ('hub', 0, false, 0, false, NOW())
ON CONFLICT ("id") DO NOTHING;
