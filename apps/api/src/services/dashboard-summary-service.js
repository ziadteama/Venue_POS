import { prisma } from '../db/prisma.js';
import { buildLiveMetrics } from './metrics-service.js';
import { netPaymentRevenue, resolveDateRange } from './analytics-service.js';
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

function startOfWeek(date) {
  const d = startOfDay(date);
  const day = d.getDay();
  const mondayOffset = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - mondayOffset);
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

function venueIdList(venues) {
  return venues.map((v) => v.id ?? v.venueId);
}

function venueWhere(venueIds) {
  return venueIds.length === 1 ? { venueId: venueIds[0] } : { venueId: { in: venueIds } };
}

async function aggregateFinancialMetrics(venueIds, from, to) {
  if (!venueIds.length) {
    return {
      netRevenue: 0,
      grossRevenue: 0,
      totalRefunds: 0,
      paymentCount: 0,
      refundCount: 0,
      avgTransactionValue: 0,
      paymentsByMethod: { cash: 0, card: 0, voucher: 0 },
      crossVenuePaidCount: 0,
    };
  }

  const chequeFilter = { ...venueWhere(venueIds), status: { not: 'voided' } };

  const [paymentAgg, refundAgg, paymentCount, refundCount, paymentsByMethodRaw, crossVenuePaidCount] =
    await Promise.all([
      prisma.payment.aggregate({
        where: { processedAt: { gte: from, lte: to }, cheque: chequeFilter },
        _sum: { amount: true },
      }),
      prisma.refund.aggregate({
        where: { processedAt: { gte: from, lte: to }, cheque: venueWhere(venueIds) },
        _sum: { amount: true },
      }),
      prisma.payment.count({
        where: { processedAt: { gte: from, lte: to }, cheque: chequeFilter },
      }),
      prisma.refund.count({
        where: { processedAt: { gte: from, lte: to }, cheque: venueWhere(venueIds) },
      }),
      prisma.payment.groupBy({
        by: ['method'],
        where: { processedAt: { gte: from, lte: to }, cheque: chequeFilter },
        _sum: { amount: true },
      }),
      prisma.cheque.count({
        where: {
          ...venueWhere(venueIds),
          isCrossVenue: true,
          status: 'paid',
          closedAt: { gte: from, lte: to },
        },
      }),
    ]);

  const gross = Number(paymentAgg._sum.amount ?? 0);
  const refunded = Number(refundAgg._sum.amount ?? 0);
  const netRevenue = Number(Math.max(0, gross - refunded).toFixed(2));
  const paymentsByMethod = { cash: 0, card: 0, voucher: 0 };

  for (const row of paymentsByMethodRaw) {
    if (paymentsByMethod[row.method] != null) {
      paymentsByMethod[row.method] = Number((row._sum.amount ?? 0).toFixed(2));
    }
  }

  return {
    netRevenue,
    grossRevenue: Number(gross.toFixed(2)),
    totalRefunds: Number(refunded.toFixed(2)),
    paymentCount,
    refundCount,
    avgTransactionValue: paymentCount > 0 ? Number((netRevenue / paymentCount).toFixed(2)) : 0,
    paymentsByMethod,
    crossVenuePaidCount,
  };
}

async function buildDailyRevenueTrend(venueIdOrIds, days = 7) {
  let venueIds;
  if (Array.isArray(venueIdOrIds)) {
    venueIds = venueIdOrIds;
  } else if (venueIdOrIds) {
    venueIds = [venueIdOrIds];
  } else {
    venueIds = (
      await prisma.venue.findMany({
        where: { isActive: true },
        select: { id: true },
        orderBy: { nameEn: 'asc' },
      })
    ).map((v) => v.id);
  }

  const trend = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const day = addDays(new Date(), -i);
    const from = startOfDay(day);
    const to = endOfDay(day);
    let revenue = 0;
    for (const id of venueIds) {
      revenue += await netPaymentRevenue(id, from, to);
    }
    trend.push({
      date: isoDate(day),
      weekday: from.toLocaleDateString('en', { weekday: 'short' }),
      revenue: Number(revenue.toFixed(2)),
    });
  }
  return trend;
}

async function buildDailyRefundTrend(venueIds, days = 7) {
  const trend = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const day = addDays(new Date(), -i);
    const from = startOfDay(day);
    const to = endOfDay(day);
    const agg = await prisma.refund.aggregate({
      where: {
        processedAt: { gte: from, lte: to },
        cheque: venueWhere(venueIds),
      },
      _sum: { amount: true },
    });
    trend.push({
      date: isoDate(day),
      weekday: from.toLocaleDateString('en', { weekday: 'short' }),
      amount: Number((agg._sum.amount ?? 0).toFixed(2)),
    });
  }
  return trend;
}

async function buildWeeklyRevenueTrend(venueIds, weeks = 8) {
  const trend = [];
  for (let i = weeks - 1; i >= 0; i -= 1) {
    const anchor = addDays(new Date(), -7 * i);
    const weekStart = startOfWeek(anchor);
    const weekEnd = i === 0 ? endOfDay(new Date()) : endOfDay(addDays(weekStart, 6));
    let revenue = 0;
    for (const id of venueIds) {
      revenue += await netPaymentRevenue(id, weekStart, weekEnd);
    }
    trend.push({
      weekStart: isoDate(weekStart),
      label: weekStart.toLocaleDateString('en', { month: 'short', day: 'numeric' }),
      revenue: Number(revenue.toFixed(2)),
    });
  }
  return trend;
}

async function fetchRecentBusinessEvents(venueId, { days = 3, limit = 15 } = {}) {
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

async function buildVenueRanking(venueRecords, liveVenues) {
  const todayRange = resolveDateRange({ preset: 'today' });
  const yesterdayRange = resolveDateRange({ preset: 'yesterday' });
  const weekRange = resolveDateRange({ preset: 'week' });
  const lastWeekRange = resolveDateRange({ preset: 'last_week' });

  const rows = await Promise.all(
    venueRecords.map(async (venue) => {
      const id = venue.id;
      const [today, yesterday, week, lastWeek, paymentCount] = await Promise.all([
        netPaymentRevenue(id, todayRange.from, todayRange.to),
        netPaymentRevenue(id, yesterdayRange.from, yesterdayRange.to),
        netPaymentRevenue(id, weekRange.from, weekRange.to),
        netPaymentRevenue(id, lastWeekRange.from, lastWeekRange.to),
        prisma.payment.count({
          where: {
            processedAt: { gte: todayRange.from, lte: todayRange.to },
            cheque: { venueId: id, status: { not: 'voided' } },
          },
        }),
      ]);

      const dayComparison = comparisonDelta(today, yesterday);
      const weekComparison = comparisonDelta(week, lastWeek);
      const liveVenue = liveVenues.find((v) => v.venueId === id);

      return {
        venueId: id,
        nameEn: venue.nameEn,
        nameAr: venue.nameAr,
        netRevenueToday: today,
        netRevenueWeek: week,
        transactionCount: paymentCount,
        avgChequeValue: paymentCount > 0 ? Number((today / paymentCount).toFixed(2)) : 0,
        changePercent: dayComparison.changePercent,
        changeAmount: dayComparison.changeAmount,
        weekGrowthPercent: weekComparison.changePercent,
        activeOrders: liveVenue?.activeOrders ?? 0,
        openTablesCount: liveVenue?.openTablesCount ?? 0,
      };
    }),
  );

  return rows.sort((a, b) => b.netRevenueToday - a.netRevenueToday);
}

function buildAttentionItems({
  summary,
  operations,
  venueRanking,
  voidCountToday,
  financial,
}) {
  const items = [];

  if (summary.netSalesWeekComparison?.changePercent <= -15) {
    items.push({
      id: 'revenue-drop-week',
      severity: 'high',
      tone: 'red',
      messageKey: 'dashboard.attention.revenueDropWeek',
      params: { percent: Math.abs(summary.netSalesWeekComparison.changePercent) },
    });
  }

  if (summary.netSalesTodayComparison?.changePercent <= -20 && summary.netSalesToday > 0) {
    items.push({
      id: 'revenue-drop-day',
      severity: 'high',
      tone: 'red',
      messageKey: 'dashboard.attention.revenueDropDay',
      params: { percent: Math.abs(summary.netSalesTodayComparison.changePercent) },
    });
  }

  if (summary.refundAmountTodayComparison?.changePercent >= 50 && summary.refundAmountToday > 0) {
    items.push({
      id: 'refund-spike',
      severity: 'medium',
      tone: 'amber',
      messageKey: 'dashboard.attention.refundSpike',
      params: { count: summary.refundCountToday ?? 0 },
    });
  }

  if ((operations.terminalsOffline ?? 0) >= 2) {
    items.push({
      id: 'terminals-offline',
      severity: 'high',
      tone: 'red',
      messageKey: 'dashboard.attention.terminalsOffline',
      params: { count: operations.terminalsOffline },
    });
  } else if ((operations.terminalsOffline ?? 0) === 1) {
    items.push({
      id: 'terminal-offline',
      severity: 'medium',
      tone: 'amber',
      messageKey: 'dashboard.alertOfflineTerminals',
      params: { count: 1 },
    });
  }

  for (const venue of venueRanking) {
    if (venue.netRevenueToday <= 0 && venue.changePercent <= -80 && venue.transactionCount === 0) {
      items.push({
        id: `venue-quiet-${venue.venueId}`,
        severity: 'medium',
        tone: 'slate',
        messageKey: 'dashboard.attention.venueLowVolume',
        params: { venue: venue.nameEn },
      });
      break;
    }
  }

  if (voidCountToday >= 5) {
    items.push({
      id: 'void-spike',
      severity: 'medium',
      tone: 'amber',
      messageKey: 'dashboard.attention.voidSpike',
      params: { count: voidCountToday },
    });
  }

  if (
    financial.crossVenueVolumeComparison?.changePercent >= 100 &&
    (financial.crossVenueVolume ?? 0) >= 3
  ) {
    items.push({
      id: 'cross-venue-growth',
      severity: 'low',
      tone: 'blue',
      messageKey: 'dashboard.attention.crossVenueGrowth',
      params: { count: financial.crossVenueVolume },
    });
  }

  if (summary.netSalesToday === 0 && summary.totalTransactions === 0) {
    items.push({
      id: 'no-sales',
      severity: 'low',
      tone: 'slate',
      messageKey: 'dashboard.alertNoSales',
      params: {},
    });
  }

  return items.slice(0, 6);
}

export async function buildExecutiveDashboard({ venueId } = {}, io) {
  const venueRecords = venueId
    ? await prisma.venue.findMany({
        where: { id: venueId, isActive: true },
        select: { id: true, nameEn: true, nameAr: true },
      })
    : await prisma.venue.findMany({
        where: { isActive: true },
        select: { id: true, nameEn: true, nameAr: true },
        orderBy: { nameEn: 'asc' },
      });

  const venueIds = venueIdList(venueRecords);
  const todayRange = resolveDateRange({ preset: 'today' });
  const yesterdayRange = resolveDateRange({ preset: 'yesterday' });
  const weekRange = resolveDateRange({ preset: 'week' });
  const lastWeekRange = resolveDateRange({ preset: 'last_week' });
  const monthRange = resolveDateRange({ preset: 'month' });
  const lastMonthRange = resolveDateRange({ preset: 'last_month' });

  const [
    live,
    recentEvents,
    health,
    dailyTrend,
    weeklyTrend,
    refundTrend,
    todayMetrics,
    yesterdayMetrics,
    weekMetrics,
    lastWeekMetrics,
    monthMetrics,
    lastMonthMetrics,
    openCheques,
    openShifts,
    voidCountToday,
  ] = await Promise.all([
    buildLiveMetrics({ venueId }),
    fetchRecentBusinessEvents(venueId, { days: 3, limit: 15 }),
    getSystemHealth(venueId, io),
    buildDailyRevenueTrend(venueIds, 7),
    buildWeeklyRevenueTrend(venueIds, 8),
    buildDailyRefundTrend(venueIds, 7),
    aggregateFinancialMetrics(venueIds, todayRange.from, todayRange.to),
    aggregateFinancialMetrics(venueIds, yesterdayRange.from, yesterdayRange.to),
    aggregateFinancialMetrics(venueIds, weekRange.from, weekRange.to),
    aggregateFinancialMetrics(venueIds, lastWeekRange.from, lastWeekRange.to),
    aggregateFinancialMetrics(venueIds, monthRange.from, monthRange.to),
    aggregateFinancialMetrics(venueIds, lastMonthRange.from, lastMonthRange.to),
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
    venueIds.length
      ? prisma.orderVoidAudit.count({
          where: {
            createdAt: { gte: todayRange.from, lte: todayRange.to },
            order: venueId ? { venueId } : { venueId: { in: venueIds } },
          },
        })
      : Promise.resolve(0),
  ]);

  const venueRanking = await buildVenueRanking(venueRecords, live.venues ?? []);

  const summary = {
    netSalesToday: todayMetrics.netRevenue,
    netSalesTodayComparison: comparisonDelta(todayMetrics.netRevenue, yesterdayMetrics.netRevenue),
    netSalesWeek: weekMetrics.netRevenue,
    netSalesWeekComparison: comparisonDelta(weekMetrics.netRevenue, lastWeekMetrics.netRevenue),
    netSalesMonth: monthMetrics.netRevenue,
    netSalesMonthComparison: comparisonDelta(monthMetrics.netRevenue, lastMonthMetrics.netRevenue),
    totalTransactions: todayMetrics.paymentCount,
    totalTransactionsComparison: comparisonDelta(
      todayMetrics.paymentCount,
      yesterdayMetrics.paymentCount,
    ),
    avgTransactionValue: todayMetrics.avgTransactionValue,
    refundAmountToday: todayMetrics.totalRefunds,
    refundCountToday: todayMetrics.refundCount,
    refundAmountTodayComparison: comparisonDelta(
      todayMetrics.totalRefunds,
      yesterdayMetrics.totalRefunds,
    ),
    activeVenues: venueRecords.length,
    revenueGrowthPercent: comparisonDelta(weekMetrics.netRevenue, lastWeekMetrics.netRevenue)
      .changePercent,
  };

  const financial = {
    refundTrend,
    netAfterRefundsWeek: weekMetrics.netRevenue,
    paymentsByMethod: weekMetrics.paymentsByMethod,
    crossVenueVolume: weekMetrics.crossVenuePaidCount,
    crossVenueVolumeComparison: comparisonDelta(
      weekMetrics.crossVenuePaidCount,
      lastWeekMetrics.crossVenuePaidCount,
    ),
  };

  const operations = {
    openShifts,
    openCheques,
    activeOrders: live.totalActiveOrders ?? 0,
    openTables: live.totalOpenTables ?? 0,
    terminalsOnline: health.summary?.onlineCount ?? 0,
    terminalsOffline: health.summary?.offlineCount ?? 0,
    terminalsTotal: health.summary?.terminalCount ?? 0,
    activeVenues: venueRecords.length,
  };

  const attention = buildAttentionItems({
    summary,
    operations,
    venueRanking,
    voidCountToday,
    financial,
  });

  const ranking = {
    venues: venueRanking,
    topVenue: venueRanking[0] ?? null,
    bottomVenue: venueRanking.length > 1 ? venueRanking[venueRanking.length - 1] : null,
  };

  return {
    generatedAt: new Date().toISOString(),
    currency: 'EGP',
    summary,
    financial,
    ranking,
    operations,
    attention,
    dailyTrend,
    weeklyTrend,
    recentEvents,
    live,
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
