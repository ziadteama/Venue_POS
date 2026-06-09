import { prisma } from '../db/prisma.js';
import { buildLiveMetrics } from './metrics-service.js';
import { buildRevenueAnalytics, netPaymentRevenue } from './analytics-service.js';
import { listFullAuditLog } from './audit-log-service.js';
import { getEodReconciliation } from './manager-shift-service.js';
import { getSystemHealth } from './manager-health-service.js';

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function isoDate(date) {
  return startOfDay(date).toISOString().slice(0, 10);
}

function comparisonDelta(current, previous) {
  if (previous === 0) {
    return { previous, changeAmount: current, changePercent: current > 0 ? 100 : 0 };
  }
  const changeAmount = Number((current - previous).toFixed(2));
  const changePercent = Number(((changeAmount / previous) * 100).toFixed(1));
  return { previous, changeAmount, changePercent };
}

async function buildDailyRevenueTrend(venueId, days = 7) {
  const venues = venueId
    ? [{ id: venueId }]
    : await prisma.venue.findMany({
        where: { isActive: true },
        select: { id: true },
        orderBy: { nameEn: 'asc' },
      });

  const trend = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const day = addDays(new Date(), -i);
    const from = startOfDay(day);
    const to = endOfDay(day);
    let revenue = 0;
    for (const venue of venues) {
      revenue += await netPaymentRevenue(venue.id, from, to);
    }
    trend.push({
      date: isoDate(day),
      weekday: from.toLocaleDateString('en', { weekday: 'short' }),
      revenue: Number(revenue.toFixed(2)),
    });
  }
  return trend;
}

async function fetchRecentBusinessEvents(venueId, { days = 3, limit = 12 } = {}) {
  const from = isoDate(addDays(new Date(), -days));

  if (venueId) {
    const result = await listFullAuditLog(venueId, { from, limit });
    return result.events;
  }

  const venues = await prisma.venue.findMany({
    where: { isActive: true },
    select: { id: true },
  });
  const batches = await Promise.all(
    venues.map((v) => listFullAuditLog(v.id, { from, limit: 8 })),
  );
  return batches
    .flatMap((batch) => batch.events)
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, limit);
}

async function buildVenuePerformanceRows(venueMetrics) {
  const yesterdayStart = startOfDay(addDays(new Date(), -1));
  const yesterdayEnd = endOfDay(addDays(new Date(), -1));

  return Promise.all(
    venueMetrics.map(async (venue) => {
      const revenueYesterday = await netPaymentRevenue(
        venue.venueId,
        yesterdayStart,
        yesterdayEnd,
      );
      const change = comparisonDelta(venue.revenueToday, revenueYesterday);
      return {
        venueId: venue.venueId,
        nameEn: venue.nameEn,
        nameAr: venue.nameAr,
        revenueToday: venue.revenueToday,
        revenueYesterday,
        changePercent: change.changePercent,
        changeAmount: change.changeAmount,
        activeOrders: venue.activeOrders,
        openTablesCount: venue.openTablesCount,
        ordersPerMinute: venue.ordersPerMinute,
      };
    }),
  );
}

export async function buildExecutiveDashboard({ venueId } = {}) {
  const [live, todayReport, weekReport, dailyTrend, recentEvents] = await Promise.all([
    buildLiveMetrics({ venueId }),
    buildRevenueAnalytics({ venueId, preset: 'today', compare: true }),
    buildRevenueAnalytics({ venueId, preset: 'week', compare: true }),
    buildDailyRevenueTrend(venueId, 7),
    fetchRecentBusinessEvents(venueId, { days: 3, limit: 12 }),
  ]);

  const venues = await buildVenuePerformanceRows(live.venues);

  return {
    generatedAt: new Date().toISOString(),
    currency: 'EGP',
    live,
    sales: {
      today: {
        revenue: todayReport.totalRevenue,
        comparison: todayReport.comparison,
      },
      week: {
        revenue: weekReport.totalRevenue,
        comparison: weekReport.comparison,
      },
      dailyTrend,
    },
    venues,
    recentEvents,
  };
}

export async function buildOperationsDashboard({ venueId } = {}, io) {
  const today = new Date();
  const yesterday = addDays(today, -1);

  const [
    eodToday,
    eodYesterday,
    openCheques,
    openShifts,
    recentEvents,
    health,
    dailyTrend,
  ] = await Promise.all([
    getEodReconciliation({ venueId, date: today }),
    getEodReconciliation({ venueId, date: yesterday }),
    prisma.cheque.count({
      where: {
        status: 'open',
        parentChequeId: null,
        ...(venueId ? { venueId } : {}),
      },
    }),
    prisma.shift.count({
      where: { status: 'open', ...(venueId ? { venueId } : {}) },
    }),
    fetchRecentBusinessEvents(venueId, { days: 3, limit: 15 }),
    getSystemHealth(venueId, io),
    buildDailyRevenueTrend(venueId, 7),
  ]);

  const revenueChange = comparisonDelta(eodToday.netRevenue, eodYesterday.netRevenue);

  return {
    generatedAt: new Date().toISOString(),
    currency: 'EGP',
    today: {
      date: eodToday.date,
      netRevenue: eodToday.netRevenue,
      grossRevenue: eodToday.totalRevenue,
      totalRefunds: eodToday.totalRefunds,
      discountTotal: eodToday.discountTotal,
      paymentCount: eodToday.paymentCount,
      refundCount: eodToday.refundCount,
      openShiftCount: eodToday.openShiftCount,
      paymentsByMethod: eodToday.paymentsByMethod,
      comparison: revenueChange,
    },
    operations: {
      openCheques,
      openShifts,
      terminalsOnline: health.summary?.onlineCount ?? 0,
      terminalsOffline: health.summary?.offlineCount ?? 0,
      terminalsTotal: health.summary?.terminalCount ?? 0,
    },
    dailyTrend,
    recentEvents,
    venues: eodToday.venues ?? null,
  };
}
