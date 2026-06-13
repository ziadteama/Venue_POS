import { CLUSTER_HYSTERESIS_TICKS, CLUSTER_MODES } from '@venue-pos/shared';

/**
 * Pure cluster state computation from peer gossip + own cloud status.
 */
export function computeClusterState({
  cloudOnline,
  terminalId,
  agentPriority,
  peers = [],
  forcedLeaderTerminalId = '',
  forcedLeaderHost = '',
  isForcedLeader = false,
  previous = {},
}) {
  let nextMode = CLUSTER_MODES.ELECTING;
  let relayHost = null;
  let relayTerminalId = null;
  let leaderId = null;
  let leaderHost = null;

  if (cloudOnline) {
    nextMode = CLUSTER_MODES.DIRECT;
  } else {
    const onlinePeers = peers.filter((p) => p.cloudOnline && p.host);
    if (onlinePeers.length > 0) {
      onlinePeers.sort((a, b) => {
        if (b.priority !== a.priority) return b.priority - a.priority;
        return a.terminalId.localeCompare(b.terminalId);
      });
      const relay = onlinePeers[0];
      relayHost = relay.host;
      relayTerminalId = relay.terminalId;
      nextMode = CLUSTER_MODES.RELAY;
    } else if (isForcedLeader) {
      leaderId = terminalId;
      nextMode = CLUSTER_MODES.LEADER;
    } else if (forcedLeaderHost && forcedLeaderTerminalId) {
      leaderId = forcedLeaderTerminalId;
      leaderHost = forcedLeaderHost;
      nextMode =
        forcedLeaderTerminalId === terminalId ? CLUSTER_MODES.LEADER : CLUSTER_MODES.FOLLOWER;
    } else {
      const candidates = [
        { terminalId, host: null, priority: agentPriority, lastSeen: Date.now() },
        ...peers.filter((p) => p.host),
      ];
      candidates.sort((a, b) => {
        if (b.priority !== a.priority) return b.priority - a.priority;
        return a.terminalId.localeCompare(b.terminalId);
      });
      const winner = candidates[0];
      leaderId = winner?.terminalId ?? terminalId;
      leaderHost = winner?.terminalId === terminalId ? null : (winner?.host ?? null);
      nextMode = leaderId === terminalId ? CLUSTER_MODES.LEADER : CLUSTER_MODES.FOLLOWER;
    }
  }

  let ticks = previous.pendingMode === nextMode ? (previous.ticks ?? 0) + 1 : 1;
  const stable = ticks >= CLUSTER_HYSTERESIS_TICKS;
  const stableMode = stable ? nextMode : (previous.stableMode ?? previous.mode ?? nextMode);

  return {
    mode: stableMode,
    pendingMode: nextMode,
    stable,
    ticks,
    relayHost: stableMode === CLUSTER_MODES.RELAY ? relayHost : null,
    relayTerminalId: stableMode === CLUSTER_MODES.RELAY ? relayTerminalId : null,
    leaderId:
      stableMode === CLUSTER_MODES.LEADER || stableMode === CLUSTER_MODES.FOLLOWER
        ? leaderId
        : null,
    leaderHost: stableMode === CLUSTER_MODES.FOLLOWER ? leaderHost : null,
    isLeader: stableMode === CLUSTER_MODES.LEADER,
    isFollower: stableMode === CLUSTER_MODES.FOLLOWER,
    isRelay: stableMode === CLUSTER_MODES.RELAY,
    isDirect: stableMode === CLUSTER_MODES.DIRECT,
    canRelayForPeers: cloudOnline,
  };
}
