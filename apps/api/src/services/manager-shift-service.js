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
  payments: true,
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
