import { buildLiveMetrics } from '../services/metrics-service.js';

export const METRICS_TICK_INTERVAL_MS = 60_000;

export function emitDashboardMetricsTick(io, payload) {
  io.to('dashboard:hub').emit('dashboard:metrics_tick', {
    event: 'dashboard:metrics_tick',
    payload,
  });

  for (const venue of payload.venues) {
    io.to(`venue:${venue.venueId}`).emit('dashboard:metrics_tick', {
      event: 'dashboard:metrics_tick',
      payload: {
        timestamp: payload.timestamp,
        totalRevenueToday: venue.revenueToday,
        totalActiveOrders: venue.activeOrders,
        totalOpenTables: venue.openTablesCount,
        ordersPerMinute: venue.ordersPerMinute,
        venues: [venue],
      },
    });
  }
}

export function startMetricsTicker(app) {
  let timer;

  async function tick() {
    if (!app.io) return;
    try {
      const payload = await buildLiveMetrics();
      emitDashboardMetricsTick(app.io, payload);
    } catch (err) {
      app.log.error({ err }, 'metrics tick failed');
    }
  }

  tick();
  timer = setInterval(tick, METRICS_TICK_INTERVAL_MS);

  return () => {
    if (timer) clearInterval(timer);
  };
}
