import { prisma } from '../db/prisma.js';
import { listChequesForVenue } from './cheque-lifecycle.js';

const ACTIVE_ORDER_STATUSES = ['sent', 'partially_ready', 'ready', 'served'];

export function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function minutesSince(isoDate) {
  return Math.max(0, Math.floor((Date.now() - new Date(isoDate).getTime()) / 60_000));
}

async function venueRevenueToday(venueId, todayStart) {
  const [payments, refunds] = await Promise.all([
    prisma.payment.aggregate({
      where: {
        processedAt: { gte: todayStart },
        cheque: { venueId, status: { not: 'voided' } },
      },
      _sum: { amount: true },
    }),
    prisma.refund.aggregate({
      where: {
        processedAt: { gte: todayStart },
        cheque: { venueId },
      },
      _sum: { amount: true },
    }),
  ]);

  const gross = Number(payments._sum.amount ?? 0);
  const refunded = Number(refunds._sum.amount ?? 0);
  return Number(Math.max(0, gross - refunded).toFixed(2));
}

async function buildVenueMetrics(venue, todayStart, oneHourAgo) {
  const [revenueToday, activeOrders, ordersLastHour, openCheques] = await Promise.all([
    venueRevenueToday(venue.id, todayStart),
    prisma.order.count({
      where: {
        venueId: venue.id,
        status: { in: ACTIVE_ORDER_STATUSES },
        chequeLink: { cheque: { status: 'open' } },
      },
    }),
    prisma.order.count({
      where: { venueId: venue.id, sentAt: { gte: oneHourAgo, not: null } },
    }),
    listChequesForVenue(venue.id, { status: 'open' }),
  ]);

  const openTables = openCheques
    .filter((cheque) => !cheque.parentChequeId)
    .map((cheque) => ({
      tableLabel: cheque.tableLabel,
      chequeId: cheque.id,
      chequeNumber: cheque.chequeNumber,
      runningTotal: cheque.total,
      minutesOpen: minutesSince(cheque.openedAt),
    }));

  return {
    venueId: venue.id,
    nameEn: venue.nameEn,
    nameAr: venue.nameAr,
    revenueToday,
    activeOrders,
    ordersPerMinute: Number((ordersLastHour / 60).toFixed(2)),
    openTablesCount: openTables.length,
    openTables,
  };
}

export async function buildLiveMetrics({ venueId } = {}) {
  const todayStart = startOfToday();
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

  const venues = await prisma.venue.findMany({
    where: {
      isActive: true,
      ...(venueId ? { id: venueId } : {}),
    },
    select: { id: true, nameEn: true, nameAr: true },
    orderBy: { nameEn: 'asc' },
  });

  const venueMetrics = await Promise.all(
    venues.map((venue) => buildVenueMetrics(venue, todayStart, oneHourAgo)),
  );

  const totalRevenueToday = Number(
    venueMetrics.reduce((sum, venue) => sum + venue.revenueToday, 0).toFixed(2),
  );
  const totalActiveOrders = venueMetrics.reduce((sum, venue) => sum + venue.activeOrders, 0);
  const totalOpenTables = venueMetrics.reduce((sum, venue) => sum + venue.openTablesCount, 0);
  const ordersPerMinute = Number(
    (venueMetrics.reduce((sum, venue) => sum + venue.ordersPerMinute, 0)).toFixed(2),
  );

  return {
    timestamp: new Date().toISOString(),
    totalRevenueToday,
    totalActiveOrders,
    totalOpenTables,
    ordersPerMinute,
    venues: venueMetrics,
  };
}
