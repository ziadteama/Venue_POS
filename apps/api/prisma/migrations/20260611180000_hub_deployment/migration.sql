-- Hub POS deployment config (electron-updater feed, managed from dashboard)
ALTER TABLE "hub_settings" ADD COLUMN IF NOT EXISTS "deployment" JSONB;
