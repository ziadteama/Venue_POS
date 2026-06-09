-- Hub-assigned static LAN IP per POS terminal (used for AGENT_PEERS / deployment docs)
ALTER TABLE "terminals" ADD COLUMN IF NOT EXISTS "assigned_lan_host" VARCHAR(255);
