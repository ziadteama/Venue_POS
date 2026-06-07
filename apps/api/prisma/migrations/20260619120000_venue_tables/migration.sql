-- Manager-assigned table labels for POS floor picker
ALTER TABLE "venues" ADD COLUMN "tables" JSONB NOT NULL DEFAULT '[]';
