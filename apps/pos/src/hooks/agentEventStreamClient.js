import { AGENT_URL } from '../config.js';

/** Shared SSE connection — one stream per POS tab (hub tables + floor events). */
let eventSource = null;
let refCount = 0;
let retryTimer = null;
const hubListeners = new Set();
const floorListeners = new Set();

function notifyHub(payload) {
  for (const fn of hubListeners) fn(payload);
}

function notifyFloor(payload) {
  for (const fn of floorListeners) fn(payload);
}

function connect() {
  if (eventSource || refCount === 0) return;
  eventSource = new EventSource(`${AGENT_URL}/v1/events/stream`);

  eventSource.addEventListener('hub:tables_updated', (event) => {
    try {
      notifyHub(JSON.parse(event.data));
    } catch {
      /* ignore malformed payload */
    }
  });

  eventSource.addEventListener('floor:table_updated', (event) => {
    try {
      notifyFloor(JSON.parse(event.data));
    } catch {
      /* ignore malformed payload */
    }
  });

  eventSource.onerror = () => {
    eventSource?.close();
    eventSource = null;
    if (refCount > 0) {
      clearTimeout(retryTimer);
      retryTimer = setTimeout(connect, 3_000);
    }
  };
}

function disconnect() {
  clearTimeout(retryTimer);
  retryTimer = null;
  eventSource?.close();
  eventSource = null;
}

export function subscribeAgentEventStream({ onHubTablesUpdated, onFloorTableUpdated } = {}) {
  if (onHubTablesUpdated) hubListeners.add(onHubTablesUpdated);
  if (onFloorTableUpdated) floorListeners.add(onFloorTableUpdated);
  refCount += 1;
  connect();

  return () => {
    if (onHubTablesUpdated) hubListeners.delete(onHubTablesUpdated);
    if (onFloorTableUpdated) floorListeners.delete(onFloorTableUpdated);
    refCount = Math.max(0, refCount - 1);
    if (refCount === 0) disconnect();
  };
}
