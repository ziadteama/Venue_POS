import { prisma } from '../db/prisma.js';
import { notFound, validationError } from '../utils/errors.js';
import {
  buildShiftReport,
  serializeShift,
  forceCloseShiftById,
} from './shift-service.js';

const PAGE_SIZE = 50;

function endOfDay(date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

const shiftInclude = {
  venue: { select: { id: true, nameEn: true, nameAr: true } },
  cashier: { select: { id: true, username: true } },
  terminal: { select: { id: true, name: true } },
  payments: { include: { cheque: { select: { discountAmount: true } } } },
  refunds: true,
};

function serializeShiftListRow(shift) {
  const report = buildShiftReport(shift, shift.payments, shift.refunds);
  const serialized = serializeShift(shift);

  return {
    ...serialized,
    venueNameEn: shift.venue.nameEn,
    venueNameAr: shift.venue.nameAr,
    cashierUsername: shift.cashier.username,
    terminalName: shift.terminal.name,
    paymentCount: report.paymentCount,
    refundCount: report.refundCount,
    discountCount: report.discountCount,
    discountTotal: report.discountTotal,
    totalRevenue: report.totalRevenue,
    totalRefunds: report.totalRefunds,
    expectedCash:
      shift.status === 'closed' && shift.expectedCash != null
        ? Number(shift.expectedCash)
        : report.expectedCash,
    overShortAmount:
      shift.overShortAmount != null ? Number(shift.overShortAmount) : null,
    paymentsByMethod: report.paymentsByMethod,
    refundsByMethod: report.refundsByMethod,
  };
}

function buildWhere(filters) {
  const where = {};

  if (filters.venueId) where.venueId = filters.venueId;

  if (filters.status) {
    if (!['open', 'closed'].includes(filters.status)) {
      throw validationError('Invalid status');
    }
    where.status = filters.status;
  }

  if (filters.cashier?.trim()) {
    where.cashier = {
      username: { contains: filters.cashier.trim(), mode: 'insensitive' },
    };
  }

  if (filters.from || filters.to) {
    where.openedAt = {};
    if (filters.from) {
      const from = new Date(filters.from);
      if (Number.isNaN(from.getTime())) throw validationError('Invalid from date');
      where.openedAt.gte = from;
    }
    if (filters.to) {
      const to = endOfDay(new Date(filters.to));
      if (Number.isNaN(to.getTime())) throw validationError('Invalid to date');
      where.openedAt.lte = to;
    }
  }

  return where;
}

export async function listManagerShifts(filters = {}) {
  const page = Math.max(1, Number(filters.page ?? 1));
  const limit = Math.min(PAGE_SIZE, Math.max(1, Number(filters.limit ?? PAGE_SIZE)));
  const where = buildWhere(filters);

  const total = await prisma.shift.count({ where });
  const shifts = await prisma.shift.findMany({
    where,
    include: shiftInclude,
    orderBy: { openedAt: 'desc' },
    skip: (page - 1) * limit,
    take: limit,
  });

  return {
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
    shifts: shifts.map(serializeShiftListRow),
  };
}

export async function getManagerShiftDetail(shiftId, venueId) {
  const shift = await prisma.shift.findUnique({
    where: { id: shiftId },
    include: shiftInclude,
  });
  if (!shift) throw notFound('Shift not found');
  if (venueId && shift.venueId !== venueId) throw notFound('Shift not found');

  const report = buildShiftReport(shift, shift.payments, shift.refunds);
  return {
    ...serializeShiftListRow(shift),
    report,
  };
}

export async function managerForceCloseShift(shiftId, body, venueId) {
  return forceCloseShiftById(shiftId, body, venueId);
}

export function shiftsListToCsv(result) {
  const lines = [
    'cashier,terminal,venue,status,open_float,expected_cash,close_float,over_short,total_revenue,opened_at,closed_at',
  ];
  for (const row of result.shifts) {
    lines.push(
      [
        csvEscape(row.cashierUsername),
        csvEscape(row.terminalName),
        csvEscape(row.venueNameEn),
        row.status,
        row.openFloat,
        row.expectedCash ?? '',
        row.closeFloat ?? '',
        row.overShortAmount ?? '',
        row.totalRevenue,
        row.openedAt,
        row.closedAt ?? '',
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

function dayBounds(dateInput) {
  let start;
  let dateLabel;

  if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
    const [year, month, day] = dateInput.split('-').map(Number);
    start = new Date(year, month - 1, day);
    dateLabel = dateInput;
  } else {
    start = new Date(dateInput ?? Date.now());
    if (Number.isNaN(start.getTime())) throw validationError('Invalid date');
    start.setHours(0, 0, 0, 0);
    const y = start.getFullYear();
    const m = String(start.getMonth() + 1).padStart(2, '0');
    const d = String(start.getDate()).padStart(2, '0');
    dateLabel = `${y}-${m}-${d}`;
  }

  return { start, end: endOfDay(start), dateLabel };
}

function aggregateShiftRows(rows) {
  const totals = {
    shiftCount: rows.length,
    openShiftCount: rows.filter((r) => r.status === 'open').length,
    closedShiftCount: rows.filter((r) => r.status === 'closed').length,
    totalRevenue: 0,
    totalRefunds: 0,
    netRevenue: 0,
    totalOverShort: 0,
    paymentsByMethod: { cash: 0, card: 0, voucher: 0 },
    refundsByMethod: { cash: 0, card: 0, voucher: 0 },
    paymentCount: 0,
    refundCount: 0,
    discountCount: 0,
    discountTotal: 0,
  };

  for (const row of rows) {
    totals.totalRevenue += row.totalRevenue ?? 0;
    totals.totalRefunds += row.totalRefunds ?? 0;
    totals.paymentCount += row.paymentCount ?? 0;
    totals.refundCount += row.refundCount ?? 0;
    totals.discountCount += row.discountCount ?? 0;
    totals.discountTotal += row.discountTotal ?? 0;
    if (row.overShortAmount != null) totals.totalOverShort += row.overShortAmount;
    for (const method of ['cash', 'card', 'voucher']) {
      totals.paymentsByMethod[method] += row.paymentsByMethod?.[method] ?? 0;
      totals.refundsByMethod[method] += row.refundsByMethod?.[method] ?? 0;
    }
  }

  totals.netRevenue = Number((totals.totalRevenue - totals.totalRefunds).toFixed(2));
  totals.totalRevenue = Number(totals.totalRevenue.toFixed(2));
  totals.totalRefunds = Number(totals.totalRefunds.toFixed(2));
  totals.discountTotal = Number(totals.discountTotal.toFixed(2));
  totals.totalOverShort = Number(totals.totalOverShort.toFixed(2));
  for (const method of ['cash', 'card', 'voucher']) {
    totals.paymentsByMethod[method] = Number(totals.paymentsByMethod[method].toFixed(2));
    totals.refundsByMethod[method] = Number(totals.refundsByMethod[method].toFixed(2));
  }
  return totals;
}

export async function getEodReconciliation({ venueId, date }) {
  const { start, end, dateLabel } = dayBounds(date ?? new Date());

  // Attribute each shift to the calendar day it opened, even if it closed later.
  const shifts = await prisma.shift.findMany({
    where: {
      ...(venueId ? { venueId } : {}),
      openedAt: { gte: start, lte: end },
    },
    include: shiftInclude,
    orderBy: { openedAt: 'asc' },
  });

  const rows = shifts.map(serializeShiftListRow);
  const totals = aggregateShiftRows(rows);

  let venues;
  if (!venueId) {
    const byVenue = new Map();
    for (const row of rows) {
      if (!byVenue.has(row.venueId)) {
        byVenue.set(row.venueId, {
          venueId: row.venueId,
          venueNameEn: row.venueNameEn,
          venueNameAr: row.venueNameAr,
          shifts: [],
        });
      }
      byVenue.get(row.venueId).shifts.push(row);
    }
    venues = [...byVenue.values()].map((v) => ({
      venueId: v.venueId,
      venueNameEn: v.venueNameEn,
      venueNameAr: v.venueNameAr,
      ...aggregateShiftRows(v.shifts),
    }));
  }

  return { date: dateLabel, venueId: venueId ?? null, ...totals, shifts: rows, venues };
}

export function eodReconciliationToCsv(result) {
  const lines = [
    'date,venue,cashier,terminal,status,total_revenue,total_refunds,over_short,opened_at,closed_at',
  ];
  for (const row of result.shifts) {
    lines.push(
      [
        result.date,
        csvEscape(row.venueNameEn),
        csvEscape(row.cashierUsername),
        csvEscape(row.terminalName),
        row.status,
        row.totalRevenue,
        row.totalRefunds,
        row.overShortAmount ?? '',
        row.openedAt,
        row.closedAt ?? '',
      ].join(','),
    );
  }
  return lines.join('\n');
}
