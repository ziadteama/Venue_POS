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
  // #region agent log
  fetch('http://127.0.0.1:7914/ingest/66a003c4-bd01-4d5a-8e95-9c5efaf28c36',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'c47f38'},body:JSON.stringify({sessionId:'c47f38',runId:'post-fix',hypothesisId:'H3',location:'agentEventStreamClient.js:connect',message:'shared sse connecting',data:{agentUrl:AGENT_URL,refCount},timestamp:Date.now()})}).catch(()=>{});
  // #endregion

  eventSource.addEventListener('hub:tables_updated', (event) => {
    try {
      const payload = JSON.parse(event.data);
      // #region agent log
      fetch('http://127.0.0.1:7914/ingest/66a003c4-bd01-4d5a-8e95-9c5efaf28c36',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'c47f38'},body:JSON.stringify({sessionId:'c47f38',runId:'post-fix',hypothesisId:'H4',location:'agentEventStreamClient.js:hub:tables_updated',message:'shared sse hub tables received',data:{tableCount:payload?.tables?.length??null},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      notifyHub(payload);
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

  eventSource.onopen = () => {
    // #region agent log
    fetch('http://127.0.0.1:7914/ingest/66a003c4-bd01-4d5a-8e95-9c5efaf28c36',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'c47f38'},body:JSON.stringify({sessionId:'c47f38',runId:'post-fix',hypothesisId:'H3',location:'agentEventStreamClient.js:onopen',message:'shared sse open',data:{},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
  };

  eventSource.onerror = () => {
    // #region agent log
    fetch('http://127.0.0.1:7914/ingest/66a003c4-bd01-4d5a-8e95-9c5efaf28c36',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'c47f38'},body:JSON.stringify({sessionId:'c47f38',runId:'post-fix',hypothesisId:'H3',location:'agentEventStreamClient.js:onerror',message:'shared sse error reconnecting',data:{readyState:eventSource?.readyState},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
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
