import { useCallback, useEffect, useState } from 'react';
import { callAgent } from '../api/agent.js';

const POLL_MS = 5000;

export function useAgentStatus() {
  const [status, setStatus] = useState({
    online: true,
    syncQueueDepth: 0,
    isCoordinator: false,
    coordinatorMode: 'off',
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
        syncQueueDepth: Number(health?.syncQueueDepth ?? agentStatus?.syncQueueDepth ?? 0),
        isCoordinator: Boolean(health?.isCoordinator ?? agentStatus?.isCoordinator),
        coordinatorMode: agentStatus?.coordinatorMode ?? 'off',
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

  return { ...status, refresh };
}
