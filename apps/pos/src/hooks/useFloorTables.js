import { useCallback, useEffect, useState } from 'react';
import { callAgent } from '../api/agent.js';

export function useFloorTables({ enabled, online }) {
  const [floorByLabel, setFloorByLabel] = useState(new Map());

  const refresh = useCallback(async () => {
    if (!enabled || !online) {
      setFloorByLabel(new Map());
      return;
    }
    try {
      const rows = await callAgent('/v1/floor/tables');
      const map = new Map();
      for (const row of Array.isArray(rows) ? rows : []) {
        map.set(row.tableLabel, row);
      }
      setFloorByLabel(map);
    } catch {
      setFloorByLabel(new Map());
    }
  }, [enabled, online]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { floorByLabel, refreshFloor: refresh };
}
