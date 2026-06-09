import { getAgentMeta, setAgentMeta } from './terminal-cache.js';

/** Resolve human-readable till label: local env/meta override, then hub name, then short id. */
export function resolveDeviceLabel(db, { envLabel, terminalId }) {
  const local = envLabel?.trim() || getAgentMeta(db, 'device_label')?.trim();
  if (local) return local;
  const hubName = getAgentMeta(db, 'hub_device_label')?.trim();
  if (hubName) return hubName;
  if (terminalId) return `POS ${terminalId.slice(0, 8)}`;
  return 'POS';
}

export function setLocalDeviceLabel(db, label) {
  if (label?.trim()) setAgentMeta(db, 'device_label', label.trim());
}

export function setHubDeviceLabel(db, name) {
  if (name?.trim()) setAgentMeta(db, 'hub_device_label', name.trim());
}

export function buildDeviceProfile({
  db,
  terminalId,
  lanHost,
  lanPort,
  agentPriority,
  clusterMode,
  envLabel,
  syncQueueDepth,
}) {
  return {
    deviceLabel: resolveDeviceLabel(db, { envLabel, terminalId }),
    lanHost: lanHost ?? null,
    lanPort: lanPort ?? null,
    agentPriority: agentPriority ?? null,
    clusterMode: clusterMode ?? null,
    syncQueueDepth: syncQueueDepth ?? 0,
  };
}
