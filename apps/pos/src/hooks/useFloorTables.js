import { useCallback, useEffect, useState } from 'react';
import { callAgent } from '../api/agent.js';

const POLL_MS = 8000;

export function useFloorTables({ enabled, coordinatorActive }) {
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
    const timer = setInterval(refresh, POLL_MS);
    return () => clearInterval(timer);
  }, [refresh, enabled]);

  return { floorByLabel, refreshFloor: refresh, coordinatorUnreachable };
}
