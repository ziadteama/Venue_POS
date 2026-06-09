import { getAgentMeta, setAgentMeta } from './terminal-cache.js';

const HUB_LAN_CONFIG_KEY = 'hub_lan_config';

export function saveHubLanConfig(db, lanConfig) {
  if (!lanConfig) return;
  setAgentMeta(db, HUB_LAN_CONFIG_KEY, JSON.stringify(lanConfig));
}

export function readHubLanConfig(db) {
  const raw = getAgentMeta(db, HUB_LAN_CONFIG_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Merge hub-assigned peer IPs into the cluster gossip table. Env peers always win first. */
export function collectPeerHosts({ envPeers = [], lanConfig, ownLanHost = null }) {
  const hosts = new Set(envPeers.filter(Boolean));
  for (const peer of lanConfig?.peers ?? []) {
    const host = peer?.lanHost || peer?.assignedLanHost || peer?.lastLanHost;
    if (host && host !== ownLanHost) hosts.add(host);
  }
  return [...hosts];
}

export function resolveCoordinatorHost({ envCoordinatorHost = '', lanConfig } = {}) {
  if (envCoordinatorHost?.trim()) return envCoordinatorHost.trim();
  return lanConfig?.coordinatorLanHost?.trim() || null;
}

export function applyHubLanConfig({
  db,
  clusterManager,
  envPeers = [],
  envCoordinatorHost = '',
  ownLanHost = null,
  coordinatorRuntime,
}) {
  const lanConfig = readHubLanConfig(db);
  const peerHosts = collectPeerHosts({ envPeers, lanConfig, ownLanHost });
  if (peerHosts.length) clusterManager.registerStaticPeers(peerHosts);

  const hubCoordinator = resolveCoordinatorHost({ envCoordinatorHost, lanConfig });
  if (hubCoordinator && coordinatorRuntime && !envCoordinatorHost?.trim()) {
    coordinatorRuntime.host = hubCoordinator;
  }

  return { lanConfig, peerHosts, coordinatorHost: coordinatorRuntime?.host ?? envCoordinatorHost };
}
