-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "VenueType" AS ENUM ('standard', 'anchor');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('hub_manager', 'venue_manager', 'cashier', 'kitchen_staff', 'system_admin');

-- CreateTable
CREATE TABLE "venues" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name_en" VARCHAR(255) NOT NULL,
    "name_ar" VARCHAR(255) NOT NULL,
    "type" "VenueType" NOT NULL DEFAULT 'standard',
    "currency" VARCHAR(3) NOT NULL DEFAULT 'EGP',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "venues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "username" VARCHAR(100),
    "password_hash" VARCHAR(255),
    "pin_hash" VARCHAR(255),
    "card_uid" VARCHAR(100),
    "role" "UserRole" NOT NULL,
    "venue_id" UUID,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "terminals" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "venue_id" UUID NOT NULL,
    "name" VARCHAR(100),
    "secret_hash" VARCHAR(255) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_seen_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "terminals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE INDEX "idx_users_venue" ON "users"("venue_id");

-- CreateIndex
CREATE INDEX "idx_users_role" ON "users"("role");

-- CreateIndex
CREATE INDEX "idx_terminals_venue" ON "terminals"("venue_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "terminals" ADD CONSTRAINT "terminals_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
