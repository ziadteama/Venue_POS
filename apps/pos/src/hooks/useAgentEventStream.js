import { useEffect } from 'react';
import { subscribeAgentEventStream } from './agentEventStreamClient.js';

/**
 * Subscribe to local-agent SSE (hub tables + floor occupancy).
 * Uses a single shared EventSource per POS tab.
 */
export function useAgentEventStream({
  enabled = true,
  onHubTablesUpdated,
  onFloorTableUpdated,
}) {
  useEffect(() => {
    if (!enabled) return undefined;
    return subscribeAgentEventStream({
      onHubTablesUpdated,
      onFloorTableUpdated,
    });
  }, [enabled, onHubTablesUpdated, onFloorTableUpdated]);
}
