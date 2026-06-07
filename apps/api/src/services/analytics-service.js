import { prisma } from '../db/prisma.js';
import { itemLineTotal } from './cheque-shared.js';
import { validationError } from '../utils/errors.js';

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

function startOfMonth(date) {
  const d = startOfDay(date);
  d.setDate(1);
  return d;
}

export function resolveDateRange({ preset = 'today', from, to } = {}) {
  const now = new Date();

  switch (preset) {
    case 'today':
      return { from: startOfDay(now), to: endOfDay(now), preset };
    case 'yesterday': {
      const y = addDays(now, -1);
      return { from: startOfDay(y), to: endOfDay(y), preset };
    }
    case 'week':
      return { from: startOfWeek(now), to: endOfDay(now), preset };
    case 'last_week': {
      const thisWeekStart = startOfWeek(now);
      const lastWeekEnd = endOfDay(addDays(thisWeekStart, -1));
      const lastWeekStart = startOfWeek(lastWeekEnd);
      return { from: lastWeekStart, to: lastWeekEnd, preset };
    }
    case 'month':
      return { from: startOfMonth(now), to: endOfDay(now), preset };
    case 'last_month': {
      const firstThisMonth = startOfMonth(now);
      const lastMonthEnd = endOfDay(addDays(firstThisMonth, -1));
      return { from: startOfMonth(lastMonthEnd), to: lastMonthEnd, preset };
    }
    case 'custom': {
      if (!from || !to) throw validationError('from and to are required for custom range');
      const rangeFrom = startOfDay(new Date(from));
      const rangeTo = endOfDay(new Date(to));
      if (Number.isNaN(rangeFrom.getTime()) || Number.isNaN(rangeTo.getTime())) {
        throw validationError('Invalid date range');
      }
      if (rangeFrom > rangeTo) throw validationError('from must be before to');
      return { from: rangeFrom, to: rangeTo, preset };
    }
    default:
      throw validationError('Invalid preset');
  }
}

export function previousPeriod(from, to) {
  const durationMs = to.getTime() - from.getTime();
  const prevTo = new Date(from.getTime() - 1);
  const prevFrom = new Date(prevTo.getTime() - durationMs);
  return { from: prevFrom, to: prevTo };
}

export async function netPaymentRevenue(venueId, from, to) {
  const chequeFilter = {
    venueId,
    status: { not: 'voided' },
  };

  const [payments, refunds] = await Promise.all([
    prisma.payment.aggregate({
      where: {
        processedAt: { gte: from, lte: to },
        cheque: chequeFilter,
      },
      _sum: { amount: true },
    }),
    prisma.refund.aggregate({
      where: {
        processedAt: { gte: from, lte: to },
        cheque: { venueId },
      },
      _sum: { amount: true },
    }),
  ]);

  const gross = Number(payments._sum.amount ?? 0);
  const refunded = Number(refunds._sum.amount ?? 0);
  return Number(Math.max(0, gross - refunded).toFixed(2));
}

async function paidChequesInRange(venueId, from, to) {
  return prisma.cheque.findMany({
    where: {
      venueId,
      status: 'paid',
      closedAt: { gte: from, lte: to },
    },
    include: {
      orders: {
        include: {
          order: {
            include: {
              items: {
                include: {
                  menuItem: { include: { category: true } },
                },
              },
            },
          },
        },
      },
    },
  });
}

function aggregateLineItems(cheques, { categoryId } = {}) {
  const byCategory = new Map();
  const byItem = new Map();
  let itemsTotal = 0;

  for (const cheque of cheques) {
    for (const link of cheque.orders) {
      const order = link.order;
      if (order.status === 'voided') continue;

      for (const item of order.items) {
        if (item.isComped) continue;
        if (categoryId && item.menuItem.categoryId !== categoryId) continue;

        const lineTotal = itemLineTotal(item);
        itemsTotal += lineTotal;

        const catId = item.menuItem.categoryId;
        const cat = item.menuItem.category;
        if (!byCategory.has(catId)) {
          byCategory.set(catId, {
            categoryId: catId,
            nameEn: cat.nameEn,
            nameAr: cat.nameAr,
            revenue: 0,
          });
        }
        byCategory.get(catId).revenue += lineTotal;

        const itemId = item.menuItemId;
        if (!byItem.has(itemId)) {
          byItem.set(itemId, {
            menuItemId: itemId,
            categoryId: catId,
            nameEn: item.menuItem.nameEn,
            nameAr: item.menuItem.nameAr,
            quantity: 0,
            revenue: 0,
          });
        }
        const row = byItem.get(itemId);
        row.quantity += item.quantity;
        row.revenue += lineTotal;
      }
    }
  }

  const round = (n) => Number(n.toFixed(2));
  return {
    itemsTotal: round(itemsTotal),
    categories: [...byCategory.values()]
      .map((c) => ({ ...c, revenue: round(c.revenue) }))
      .sort((a, b) => b.revenue - a.revenue),
    items: [...byItem.values()]
      .map((i) => ({ ...i, revenue: round(i.revenue) }))
      .sort((a, b) => b.revenue - a.revenue),
  };
}

function comparisonDelta(current, previous) {
  if (previous === 0) {
    return { previous, changeAmount: current, changePercent: current > 0 ? 100 : 0 };
  }
  const changeAmount = Number((current - previous).toFixed(2));
  const changePercent = Number(((changeAmount / previous) * 100).toFixed(1));
  return { previous, changeAmount, changePercent };
}

export async function buildRevenueAnalytics({
  venueId,
  preset = 'today',
  from,
  to,
  categoryId,
  compare = true,
} = {}) {
  const range = resolveDateRange({ preset, from, to });
  const venueWhere = { isActive: true, ...(venueId ? { id: venueId } : {}) };
  const venues = await prisma.venue.findMany({
    where: venueWhere,
    select: { id: true, nameEn: true, nameAr: true },
    orderBy: { nameEn: 'asc' },
  });

  const byVenue = await Promise.all(
    venues.map(async (venue) => ({
      venueId: venue.id,
      nameEn: venue.nameEn,
      nameAr: venue.nameAr,
      revenue: await netPaymentRevenue(venue.id, range.from, range.to),
    })),
  );

  const totalRevenue = Number(byVenue.reduce((s, v) => s + v.revenue, 0).toFixed(2));

  let comparison = null;
  if (compare) {
    const prev = previousPeriod(range.from, range.to);
    const previousTotal = Number(
      (
        await Promise.all(venues.map((v) => netPaymentRevenue(v.id, prev.from, prev.to)))
      )
        .reduce((s, n) => s + n, 0)
        .toFixed(2),
    );
    comparison = {
      preset: range.preset,
      previousRange: { from: prev.from.toISOString(), to: prev.to.toISOString() },
      ...comparisonDelta(totalRevenue, previousTotal),
    };
  }

  let categories = [];
  let items = [];
  const drillVenueId = venueId ?? (byVenue.length === 1 ? byVenue[0]?.venueId : null);

  if (drillVenueId) {
    const cheques = await paidChequesInRange(drillVenueId, range.from, range.to);
    const breakdown = aggregateLineItems(cheques, { categoryId });
    categories = breakdown.categories;
    items = categoryId ? breakdown.items : breakdown.items.slice(0, 20);
  }

  return {
    range: {
      preset: range.preset,
      from: range.from.toISOString(),
      to: range.to.toISOString(),
    },
    currency: 'EGP',
    totalRevenue,
    comparison,
    byVenue: byVenue.sort((a, b) => b.revenue - a.revenue),
    drillVenueId,
    categories,
    items,
  };
}

export function revenueAnalyticsToCsv(report) {
  const lines = ['section,key,name_en,name_ar,revenue,quantity'];
  for (const v of report.byVenue) {
    lines.push(
      ['venue', v.venueId, csvEscape(v.nameEn), csvEscape(v.nameAr), v.revenue, ''].join(','),
    );
  }
  for (const c of report.categories) {
    lines.push(
      [
        'category',
        c.categoryId,
        csvEscape(c.nameEn),
        csvEscape(c.nameAr),
        c.revenue,
        '',
      ].join(','),
    );
  }
  for (const i of report.items) {
    lines.push(
      [
        'item',
        i.menuItemId,
        csvEscape(i.nameEn),
        csvEscape(i.nameAr),
        i.revenue,
        i.quantity,
      ].join(','),
    );
  }
  return lines.join('\n');
}

function csvEscape(value) {
  const s = String(value ?? '');
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}
