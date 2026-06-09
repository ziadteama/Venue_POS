-- Terminal device profile reported by local-agent (LAN address + cluster state)
ALTER TABLE "terminals" ADD COLUMN IF NOT EXISTS "last_lan_host" VARCHAR(255);
ALTER TABLE "terminals" ADD COLUMN IF NOT EXISTS "last_lan_port" INTEGER;
ALTER TABLE "terminals" ADD COLUMN IF NOT EXISTS "last_agent_priority" INTEGER;
ALTER TABLE "terminals" ADD COLUMN IF NOT EXISTS "last_cluster_mode" VARCHAR(32);
