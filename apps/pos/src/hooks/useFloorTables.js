import { useCallback, useEffect, useState } from 'react';
import { POS_FLOOR_POLL_OFFLINE_MS } from '@venue-pos/shared';
import { callAgent } from '../api/agent.js';

export function useFloorTables({ enabled, coordinatorActive, online = false }) {
  const [floorByLabel, setFloorByLabel] = useState(new Map());
  const [coordinatorUnreachable, setCoordinatorUnreachable] = useState(false);

  const refresh = useCallback(async () => {
    if (!enabled) {
      setFloorByLabel(new Map());
      setCoordinatorUnreachable(false);
      return;
    }
    try {
      const rows = await callAgent('/v1/floor/tables');
      const map = new Map();
      for (const row of Array.isArray(rows) ? rows : []) {
        map.set(row.tableLabel, row);
      }
      setFloorByLabel(map);
      setCoordinatorUnreachable(false);
    } catch {
      setFloorByLabel(new Map());
      if (coordinatorActive) setCoordinatorUnreachable(true);
    }
  }, [enabled, coordinatorActive]);

  useEffect(() => {
    refresh();
    if (!enabled) return undefined;
    if (online) return undefined;
    const timer = setInterval(refresh, POS_FLOOR_POLL_OFFLINE_MS);
    return () => clearInterval(timer);
  }, [refresh, enabled, online]);

  return { floorByLabel, refreshFloor: refresh, coordinatorUnreachable };
}
