import { useCallback, useEffect, useRef, useState } from 'react';
import {
  POS_AGENT_STATUS_POLL_MS,
  POS_AGENT_STATUS_POLL_IDLE_MS,
} from '@venue-pos/shared';
import { AGENT_URL } from '../config.js';

const FETCH_TIMEOUT_MS = 4_000;
const AGENT_FAILURES_TO_OFFLINE = 2;

export function useAgentStatus() {
  const agentFailuresRef = useRef(0);
  const [pollMs, setPollMs] = useState(POS_AGENT_STATUS_POLL_MS);
  const [status, setStatus] = useState({
    online: true,
    agentReachable: true,
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
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(`${AGENT_URL()}/v1/status`, { signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) throw new Error('Agent status failed');
      const agentStatus = await res.json();
      agentFailuresRef.current = 0;
      const syncQueueDepth = Number(agentStatus?.syncQueueDepth ?? 0);
      const syncFailedCount = Number(agentStatus?.syncFailedCount ?? 0);
      const idle =
        agentStatus?.online &&
        syncQueueDepth === 0 &&
        syncFailedCount === 0 &&
        !agentStatus?.syncProgress?.syncing;
      setPollMs(idle ? POS_AGENT_STATUS_POLL_IDLE_MS : POS_AGENT_STATUS_POLL_MS);
      setStatus({
        online: Boolean(agentStatus?.online),
        agentReachable: true,
        deviceLabel: agentStatus?.deviceLabel ?? null,
        syncQueueDepth,
        syncFailedCount,
        syncProgress: agentStatus?.syncProgress ?? null,
        menuStale: Boolean(agentStatus?.menuStale),
        isCoordinator: Boolean(agentStatus?.isCoordinator),
        coordinatorMode: agentStatus?.coordinatorMode ?? 'off',
        clusterMode: agentStatus?.clusterMode ?? 'direct',
        leaderId: agentStatus?.leaderId ?? null,
        leaderPeerLabel: agentStatus?.leaderPeerLabel ?? null,
        relayHost: agentStatus?.relayHost ?? null,
        relayTerminalId: agentStatus?.relayTerminalId ?? null,
        relayPeerLabel: agentStatus?.relayPeerLabel ?? null,
        coordinatorLanHost: null,
        loading: false,
      });
    } catch {
      clearTimeout(timer);
      agentFailuresRef.current += 1;
      setPollMs(POS_AGENT_STATUS_POLL_MS);
      if (agentFailuresRef.current >= AGENT_FAILURES_TO_OFFLINE) {
        setStatus((prev) => ({
          ...prev,
          agentReachable: false,
          online: false,
          loading: false,
        }));
      } else {
        setStatus((prev) => ({ ...prev, loading: false }));
      }
    }
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, pollMs);
    return () => clearInterval(timer);
  }, [refresh, pollMs]);

  const coordinatorActive =
    status.clusterMode === 'leader' ||
    status.clusterMode === 'follower' ||
    status.coordinatorMode === 'active' ||
    (status.coordinatorMode === 'client' && Boolean(status.coordinatorLanHost));

  return { ...status, coordinatorActive, refresh };
}
