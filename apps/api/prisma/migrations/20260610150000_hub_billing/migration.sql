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

INSERT INTO "hub_billing" ("id", "tax_rate", "tax_inclusive", "service_rate", "service_enabled", "updated_at")
SELECT
    'hub',
    COALESCE(v."tax_rate", 0),
    COALESCE(v."tax_inclusive", false),
    COALESCE(v."service_rate", 0),
    COALESCE(v."service_enabled", false),
    NOW()
FROM "venues" v
WHERE v."is_active" = true
ORDER BY CASE WHEN v."type" = 'anchor' THEN 0 ELSE 1 END, v."created_at" ASC
LIMIT 1
ON CONFLICT ("id") DO NOTHING;
