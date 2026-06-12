-- Per-terminal Manager PIN hash for kiosk exit (default 0000 applied in seed/backfill script).
ALTER TABLE "terminals" ADD COLUMN IF NOT EXISTS "kiosk_exit_pin_hash" VARCHAR(255);
