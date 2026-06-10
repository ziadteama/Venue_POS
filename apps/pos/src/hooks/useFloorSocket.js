import { useCallback } from 'react';
import { useAgentEventStream } from './useAgentEventStream.js';

/**
 * Live hub floor updates via local-agent SSE (online cloud WS + offline coordinator).
 * Falls back to polling in useFloorTables when WAN is down.
 */
export function useFloorSocket({ enabled, agentReachable, onFloorUpdate }) {
  const handleFloorEvent = useCallback(
    (payload) => {
      if (payload?.tableLabel) onFloorUpdate?.(payload);
    },
    [onFloorUpdate],
  );

  useAgentEventStream({
    enabled: enabled && agentReachable,
    onFloorTableUpdated: handleFloorEvent,
  });
}
