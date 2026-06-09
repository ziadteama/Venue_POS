import { PEER_STALE_MS } from '@venue-pos/shared';
import { computeClusterState } from './cluster-state.js';
import { isCloudOnline } from './cloud-health.js';
import { lanFetch } from './lan-fetch.js';
import { getSyncQueueDepth } from './sync-processor.js';

/**
 * Maintains peer table + computed cluster mode (direct / relay / leader / follower).
 */
export function createClusterManager({
  terminalId,
  agentPriority,
  lanPort,
  lanSecret,
  forcedLeaderTerminalId = '',
  forcedLeaderHost = '',
  isForcedLeader = false,
  staticPeerHosts = [],
  getOwnLanHost = () => null,
  getDeviceLabel = () => null,
  getLanPort = () => null,
}) {
  const peers = new Map();
  let state = computeClusterState({
    cloudOnline: isCloudOnline(),
    terminalId,
    agentPriority,
    peers: [],
    forcedLeaderTerminalId,
    forcedLeaderHost,
    isForcedLeader,
  });

  function registerStaticPeers(hosts) {
    for (const host of hosts) {
      if (!host) continue;
      const key = `static:${host}`;
      if (!peers.has(key)) {
        peers.set(key, {
          terminalId: key,
          host,
          priority: 0,
          cloudOnline: false,
          lastSeen: Date.now(),
          static: true,
        });
      }
    }
  }

  registerStaticPeers(staticPeerHosts);

  function upsertPeer(info) {
    if (!info?.terminalId || info.terminalId === terminalId) return;
    peers.set(info.terminalId, {
      ...peers.get(info.terminalId),
      ...info,
      lastSeen: Date.now(),
    });
  }

  function pruneStalePeers() {
    const now = Date.now();
    for (const [id, peer] of peers) {
      if (peer.static) continue;
      if (now - peer.lastSeen > PEER_STALE_MS) peers.delete(id);
    }
  }

  function recompute() {
    pruneStalePeers();
    const peerList = [...peers.values()].filter((p) => p.host);
    state = computeClusterState({
      cloudOnline: isCloudOnline(),
      terminalId,
      agentPriority,
      peers: peerList,
      forcedLeaderTerminalId,
      forcedLeaderHost,
      isForcedLeader,
      previous: state,
    });
    return state;
  }

  function getState() {
    return state;
  }

  function getPeerList() {
    return [...peers.values()];
  }

  function buildGossipPayload() {
    return {
      terminalId,
      host: getOwnLanHost(),
      lanPort: getLanPort(),
      deviceLabel: getDeviceLabel(),
      priority: agentPriority,
      cloudOnline: isCloudOnline(),
      queueDepth: 0,
      mode: state.mode,
      leaderId: state.leaderId,
      relayHost: state.relayHost,
    };
  }

  async function gossipToPeer(host) {
    try {
      const payload = buildGossipPayload();
      const remote = await lanFetch(host, '/v1/peer/health', {
        lanPort,
        lanSecret,
        method: 'POST',
        body: payload,
      });
      if (remote?.terminalId) {
        upsertPeer({
          terminalId: remote.terminalId,
          host: remote.host ?? host,
          lanPort: remote.lanPort,
          deviceLabel: remote.deviceLabel,
          priority: remote.priority ?? 0,
          cloudOnline: Boolean(remote.cloudOnline),
          mode: remote.mode,
          leaderId: remote.leaderId,
        });
      }
      return remote;
    } catch {
      return null;
    }
  }

  async function runGossip() {
    recompute();
    const targets = new Set(staticPeerHosts);
    for (const peer of peers.values()) {
      if (peer.host) targets.add(peer.host);
    }
    await Promise.all([...targets].map((host) => gossipToPeer(host)));
    recompute();
  }

  function applyRemoteGossip(remote, remoteHost) {
    upsertPeer({
      terminalId: remote.terminalId,
      host: remote.host ?? remoteHost,
      lanPort: remote.lanPort,
      deviceLabel: remote.deviceLabel,
      priority: remote.priority ?? 0,
      cloudOnline: Boolean(remote.cloudOnline),
      queueDepth: remote.queueDepth ?? 0,
      mode: remote.mode,
      leaderId: remote.leaderId,
    });
    recompute();
    return buildGossipPayload();
  }

  return {
    upsertPeer,
    recompute,
    getState,
    getPeerList,
    runGossip,
    applyRemoteGossip,
    buildGossipPayload,
    registerStaticPeers,
  };
}

export function attachQueueDepth(clusterManager, db) {
  const original = clusterManager.buildGossipPayload.bind(clusterManager);
  clusterManager.buildGossipPayload = () => ({
    ...original(),
    queueDepth: getSyncQueueDepth(db),
  });
}
