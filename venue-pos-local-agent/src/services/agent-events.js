import { EventEmitter } from 'node:events';

const bus = new EventEmitter();
bus.setMaxListeners(50);

/** Push a real-time event to POS clients subscribed on /v1/events/stream. */
export function publishAgentEvent(event, payload) {
  bus.emit('event', { event, payload });
}

export function subscribeAgentEvents(listener) {
  bus.on('event', listener);
  return () => bus.off('event', listener);
}
