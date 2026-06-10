-- Venue-centric menus: replace menu_templates with venue_menus

DROP TABLE IF EXISTS "venue_menus" CASCADE;
ALTER TABLE "categories" DROP COLUMN IF EXISTS "venue_id";
ALTER TABLE "modifier_groups" DROP COLUMN IF EXISTS "venue_id";

CREATE TABLE "venue_menus" (
    "venue_id" UUID NOT NULL,
    "status" "MenuStatus" NOT NULL DEFAULT 'draft',
    "published_at" TIMESTAMPTZ(6),
    "version_hash" VARCHAR(64),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "venue_menus_pkey" PRIMARY KEY ("venue_id")
);

ALTER TABLE "categories" ADD COLUMN "venue_id" UUID;
ALTER TABLE "modifier_groups" ADD COLUMN "venue_id" UUID;

INSERT INTO "venue_menus" ("venue_id", "status", "published_at", "version_hash", "updated_at")
SELECT DISTINCT ON (mtv."venue_id")
  mtv."venue_id",
  mt."status",
  mt."published_at",
  mt."version_hash",
  COALESCE(mt."updated_at", CURRENT_TIMESTAMP)
FROM "menu_template_venues" mtv
JOIN "menu_templates" mt ON mt."id" = mtv."menu_template_id"
ORDER BY mtv."venue_id", mt."published_at" DESC NULLS LAST;

INSERT INTO "venue_menus" ("venue_id", "status")
SELECT v."id", 'draft'::"MenuStatus"
FROM "venues" v
WHERE v."is_active" = true
  AND NOT EXISTS (SELECT 1 FROM "venue_menus" vm WHERE vm."venue_id" = v."id");

DO $$
DECLARE
  rec RECORD;
  v_venue RECORD;
  v_idx INT;
  v_cat RECORD;
  v_new_cat_id UUID;
  v_item RECORD;
  v_new_item_id UUID;
  v_group RECORD;
  v_new_group_id UUID;
  v_opt RECORD;
  v_mim RECORD;
  v_cat_map JSONB;
  v_item_map JSONB;
  v_group_map JSONB;
BEGIN
  FOR rec IN SELECT DISTINCT "menu_template_id" FROM "menu_template_venues" LOOP
    v_idx := 0;
    FOR v_venue IN
      SELECT "venue_id" FROM "menu_template_venues"
      WHERE "menu_template_id" = rec."menu_template_id"
      ORDER BY "venue_id"
    LOOP
      v_idx := v_idx + 1;
      IF v_idx = 1 THEN
        UPDATE "categories" SET "venue_id" = v_venue."venue_id"
        WHERE "menu_template_id" = rec."menu_template_id";
        UPDATE "modifier_groups" SET "venue_id" = v_venue."venue_id"
        WHERE "menu_template_id" = rec."menu_template_id";
      ELSE
        v_cat_map := '{}'::jsonb;
        v_item_map := '{}'::jsonb;
        v_group_map := '{}'::jsonb;

        FOR v_cat IN
          SELECT * FROM "categories"
          WHERE "menu_template_id" = rec."menu_template_id"
          ORDER BY "sort_order"
        LOOP
          v_new_cat_id := gen_random_uuid();
          v_cat_map := v_cat_map || jsonb_build_object(v_cat."id"::text, v_new_cat_id::text);
          INSERT INTO "categories" (
            "id", "venue_id", "name_en", "name_ar", "sort_order", "is_active", "created_at", "updated_at"
          ) VALUES (
            v_new_cat_id, v_venue."venue_id", v_cat."name_en", v_cat."name_ar",
            v_cat."sort_order", v_cat."is_active", v_cat."created_at", CURRENT_TIMESTAMP
          );
        END LOOP;

        FOR v_item IN
          SELECT mi.* FROM "menu_items" mi
          JOIN "categories" c ON c."id" = mi."category_id"
          WHERE c."menu_template_id" = rec."menu_template_id"
        LOOP
          v_new_item_id := gen_random_uuid();
          v_item_map := v_item_map || jsonb_build_object(v_item."id"::text, v_new_item_id::text);
          INSERT INTO "menu_items" (
            "id", "category_id", "name_en", "name_ar", "description_en", "description_ar",
            "price", "tax_rate", "image_url", "is_available", "sort_order", "is_active",
            "created_at", "updated_at"
          ) VALUES (
            v_new_item_id,
            (v_cat_map->>v_item."category_id"::text)::uuid,
            v_item."name_en", v_item."name_ar", v_item."description_en", v_item."description_ar",
            v_item."price", v_item."tax_rate", v_item."image_url", v_item."is_available",
            v_item."sort_order", v_item."is_active", v_item."created_at", CURRENT_TIMESTAMP
          );
        END LOOP;

        FOR v_group IN
          SELECT * FROM "modifier_groups"
          WHERE "menu_template_id" = rec."menu_template_id"
        LOOP
          v_new_group_id := gen_random_uuid();
          v_group_map := v_group_map || jsonb_build_object(v_group."id"::text, v_new_group_id::text);
          INSERT INTO "modifier_groups" (
            "id", "venue_id", "name_en", "name_ar", "min_selection", "max_selection",
            "sort_order", "is_active", "created_at", "updated_at"
          ) VALUES (
            v_new_group_id, v_venue."venue_id", v_group."name_en", v_group."name_ar",
            v_group."min_selection", v_group."max_selection", v_group."sort_order",
            v_group."is_active", v_group."created_at", CURRENT_TIMESTAMP
          );

          FOR v_opt IN
            SELECT * FROM "modifier_options" WHERE "modifier_group_id" = v_group."id"
          LOOP
            INSERT INTO "modifier_options" (
              "id", "modifier_group_id", "name_en", "name_ar", "price_delta",
              "sort_order", "is_active", "created_at", "updated_at"
            ) VALUES (
              gen_random_uuid(), v_new_group_id, v_opt."name_en", v_opt."name_ar",
              v_opt."price_delta", v_opt."sort_order", v_opt."is_active",
              v_opt."created_at", CURRENT_TIMESTAMP
            );
          END LOOP;
        END LOOP;

        FOR v_mim IN
          SELECT mim.* FROM "menu_item_modifiers" mim
          JOIN "menu_items" mi ON mi."id" = mim."menu_item_id"
          JOIN "categories" c ON c."id" = mi."category_id"
          WHERE c."menu_template_id" = rec."menu_template_id"
        LOOP
          IF v_item_map ? v_mim."menu_item_id"::text AND v_group_map ? v_mim."modifier_group_id"::text THEN
            INSERT INTO "menu_item_modifiers" ("menu_item_id", "modifier_group_id")
            VALUES (
              (v_item_map->>v_mim."menu_item_id"::text)::uuid,
              (v_group_map->>v_mim."modifier_group_id"::text)::uuid
            )
            ON CONFLICT DO NOTHING;
          END IF;
        END LOOP;
      END IF;
    END LOOP;
  END LOOP;
END $$;

ALTER TABLE "categories" DROP CONSTRAINT "categories_menu_template_id_fkey";
DROP INDEX IF EXISTS "idx_categories_template";
ALTER TABLE "categories" DROP COLUMN "menu_template_id";
ALTER TABLE "categories" ALTER COLUMN "venue_id" SET NOT NULL;
CREATE INDEX "idx_categories_venue" ON "categories"("venue_id");
ALTER TABLE "categories" ADD CONSTRAINT "categories_venue_id_fkey"
  FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "modifier_groups" DROP CONSTRAINT "modifier_groups_menu_template_id_fkey";
DROP INDEX IF EXISTS "idx_modifier_groups_template";
ALTER TABLE "modifier_groups" DROP COLUMN "menu_template_id";
ALTER TABLE "modifier_groups" ALTER COLUMN "venue_id" SET NOT NULL;
CREATE INDEX "idx_modifier_groups_venue" ON "modifier_groups"("venue_id");
ALTER TABLE "modifier_groups" ADD CONSTRAINT "modifier_groups_venue_id_fkey"
  FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "venue_menus" ADD CONSTRAINT "venue_menus_venue_id_fkey"
  FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

DROP TABLE "menu_template_venues";
DROP TABLE "menu_templates";
