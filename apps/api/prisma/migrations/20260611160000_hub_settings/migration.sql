CREATE TABLE "hub_settings" (
    "id" VARCHAR(32) NOT NULL DEFAULT 'singleton',
    "features" JSONB,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "hub_settings_pkey" PRIMARY KEY ("id")
);

INSERT INTO "hub_settings" ("id", "features", "updated_at")
VALUES ('singleton', NULL, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
