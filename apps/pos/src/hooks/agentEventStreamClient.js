import { AGENT_URL } from '../config.js';

/** Shared SSE connection — one stream per POS tab (hub tables + floor events). */
let eventSource = null;
let refCount = 0;
let retryTimer = null;
const hubListeners = new Set();
const floorListeners = new Set();
const menuListeners = new Set();

function notifyHub(payload) {
  for (const fn of hubListeners) fn(payload);
}

function notifyFloor(payload) {
  for (const fn of floorListeners) fn(payload);
}

function notifyMenu(payload) {
  for (const fn of menuListeners) fn(payload);
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

  eventSource.addEventListener('menu:updated', (event) => {
    try {
      const payload = JSON.parse(event.data);
      // #region agent log
      fetch('http://127.0.0.1:7914/ingest/66a003c4-bd01-4d5a-8e95-9c5efaf28c36',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'c47f38'},body:JSON.stringify({sessionId:'c47f38',hypothesisId:'E',location:'agentEventStreamClient.js:menu:updated',message:'POS received menu SSE',data:payload,timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      notifyMenu(payload);
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

export function subscribeAgentEventStream({
  onHubTablesUpdated,
  onFloorTableUpdated,
  onMenuUpdated,
} = {}) {
  if (onHubTablesUpdated) hubListeners.add(onHubTablesUpdated);
  if (onFloorTableUpdated) floorListeners.add(onFloorTableUpdated);
  if (onMenuUpdated) menuListeners.add(onMenuUpdated);
  refCount += 1;
  connect();

  return () => {
    if (onHubTablesUpdated) hubListeners.delete(onHubTablesUpdated);
    if (onFloorTableUpdated) floorListeners.delete(onFloorTableUpdated);
    if (onMenuUpdated) menuListeners.delete(onMenuUpdated);
    refCount = Math.max(0, refCount - 1);
    if (refCount === 0) disconnect();
  };
}
