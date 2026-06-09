import { useCallback, useEffect, useState } from 'react';
import { callAgent } from '../api/agent.js';

const POLL_MS = 5000;

export function useAgentStatus() {
  const [status, setStatus] = useState({
    online: true,
    deviceLabel: null,
    syncQueueDepth: 0,
    syncFailedCount: 0,
    syncProgress: null,
    menuStale: false,
    isCoordinator: false,
    coordinatorMode: 'off',
    clusterMode: 'direct',
    leaderId: null,
    leaderPeerLabel: null,
    relayHost: null,
    relayTerminalId: null,
    relayPeerLabel: null,
    coordinatorLanHost: null,
    loading: true,
  });

  const refresh = useCallback(async () => {
    try {
      const [agentStatus, health] = await Promise.all([
        callAgent('/v1/status'),
        callAgent('/health'),
      ]);
      setStatus({
        online: Boolean(agentStatus?.online),
        deviceLabel: agentStatus?.deviceLabel ?? health?.deviceLabel ?? null,
        syncQueueDepth: Number(health?.syncQueueDepth ?? agentStatus?.syncQueueDepth ?? 0),
        syncFailedCount: Number(health?.syncFailedCount ?? agentStatus?.syncFailedCount ?? 0),
        syncProgress: health?.syncProgress ?? agentStatus?.syncProgress ?? null,
        menuStale: Boolean(health?.menuStale ?? agentStatus?.menuStale),
        isCoordinator: Boolean(health?.isCoordinator ?? agentStatus?.isCoordinator),
        coordinatorMode: agentStatus?.coordinatorMode ?? health?.coordinatorMode ?? 'off',
        clusterMode: agentStatus?.clusterMode ?? health?.clusterMode ?? 'direct',
        leaderId: agentStatus?.leaderId ?? health?.leaderId ?? null,
        leaderPeerLabel: agentStatus?.leaderPeerLabel ?? health?.leaderPeerLabel ?? null,
        relayHost: agentStatus?.relayHost ?? health?.relayHost ?? null,
        relayTerminalId: agentStatus?.relayTerminalId ?? health?.relayTerminalId ?? null,
        relayPeerLabel: agentStatus?.relayPeerLabel ?? health?.relayPeerLabel ?? null,
        coordinatorLanHost: health?.coordinatorLanHost ?? null,
        loading: false,
      });
    } catch {
      setStatus((prev) => ({ ...prev, online: false, loading: false }));
    }
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, POLL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  const coordinatorActive =
    status.clusterMode === 'leader' ||
    status.clusterMode === 'follower' ||
    status.coordinatorMode === 'active' ||
    (status.coordinatorMode === 'client' && Boolean(status.coordinatorLanHost));

  return { ...status, coordinatorActive, refresh };
}
