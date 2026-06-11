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
  payments: {
    include: {
      cheque: { select: { chequeNumber: true, tableLabel: true, discountAmount: true } },
    },
    orderBy: { processedAt: 'asc' },
  },
  refunds: {
    include: {
      cheque: { select: { chequeNumber: true, tableLabel: true } },
      initiator: { select: { username: true } },
      approver: { select: { username: true } },
    },
    orderBy: { processedAt: 'asc' },
  },
};

async function voidCompCountsByChequeIds(chequeIds) {
  const voidByCheque = new Map();
  const compByCheque = new Map();
  if (!chequeIds.length) return { voidByCheque, compByCheque };

  const [voids, comps] = await Promise.all([
    prisma.orderVoidAudit.findMany({
      where: { order: { chequeLink: { chequeId: { in: chequeIds } } } },
      select: { order: { select: { chequeLink: { select: { chequeId: true } } } } },
    }),
    prisma.orderItemCompAudit.groupBy({
      by: ['chequeId'],
      where: { chequeId: { in: chequeIds } },
      _count: { _all: true },
    }),
  ]);

  for (const row of voids) {
    const chequeId = row.order.chequeLink?.chequeId;
    if (chequeId) voidByCheque.set(chequeId, (voidByCheque.get(chequeId) ?? 0) + 1);
  }
  for (const row of comps) {
    compByCheque.set(row.chequeId, row._count._all);
  }
  return { voidByCheque, compByCheque };
}

function sumCountsForCheques(chequeIds, countMap) {
  let total = 0;
  for (const id of chequeIds) total += countMap.get(id) ?? 0;
  return total;
}

function chequeIdsForShift(shift) {
  return [
    ...new Set([
      ...shift.payments.map((p) => p.chequeId),
      ...shift.refunds.map((r) => r.chequeId),
    ]),
  ];
}

async function enrichShiftsWithVoidCompCounts(shifts) {
  const allChequeIds = [...new Set(shifts.flatMap(chequeIdsForShift))];
  const { voidByCheque, compByCheque } = await voidCompCountsByChequeIds(allChequeIds);
  return shifts.map((shift) => {
    const chequeIds = chequeIdsForShift(shift);
    return {
      voidCount: sumCountsForCheques(chequeIds, voidByCheque),
      compCount: sumCountsForCheques(chequeIds, compByCheque),
    };
  });
}

function serializePaymentRow(payment) {
  return {
    id: payment.id,
    chequeNumber: payment.cheque.chequeNumber,
    tableLabel: payment.cheque.tableLabel,
    method: payment.method,
    amount: Number(payment.amount),
    processedAt: payment.processedAt.toISOString(),
  };
}

function serializeRefundRow(refund) {
  return {
    id: refund.id,
    chequeNumber: refund.cheque.chequeNumber,
    tableLabel: refund.cheque.tableLabel,
    method: refund.method,
    amount: Number(refund.amount),
    reason: refund.reason,
    initiatorUsername: refund.initiator.username,
    approverUsername: refund.approver.username,
    processedAt: refund.processedAt.toISOString(),
  };
}

function serializeDiscountRow(row) {
  return {
    id: row.id,
    chequeNumber: row.cheque.chequeNumber,
    tableLabel: row.cheque.tableLabel,
    action: row.action,
    amount: Number(row.amount),
    previousAmount: row.previousAmount != null ? Number(row.previousAmount) : null,
    percent: row.percent != null ? Number(row.percent) : null,
    reason: row.reason,
    initiatorUsername: row.initiator.username,
    approverUsername: row.approver.username,
    createdAt: row.createdAt.toISOString(),
  };
}

function serializeVoidRow(row) {
  return {
    id: row.id,
    orderNumber: row.order.orderNumber,
    tableLabel: row.order.tableLabel,
    reason: row.reason,
    cashierUsername: row.cashier.username,
    approverUsername: row.approver.username,
    createdAt: row.createdAt.toISOString(),
  };
}

function serializeCompRow(row) {
  return {
    id: row.id,
    chequeNumber: row.cheque.chequeNumber,
    tableLabel: row.cheque.tableLabel,
    itemName: row.orderItem.menuItem.nameEn,
    reason: row.reason,
    approverUsername: row.approver.username,
    createdAt: row.createdAt.toISOString(),
  };
}

function serializeShiftListRow(shift, { voidCount = 0, compCount = 0 } = {}) {
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
    voidCount,
    compCount,
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

  const voidCompCounts = await enrichShiftsWithVoidCompCounts(shifts);

  return {
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
    shifts: shifts.map((shift, index) =>
      serializeShiftListRow(shift, voidCompCounts[index]),
    ),
  };
}

export async function getManagerShiftDetail(shiftId, venueId) {
  const shift = await prisma.shift.findUnique({
    where: { id: shiftId },
    include: shiftInclude,
  });
  if (!shift) throw notFound('Shift not found');
  if (venueId && shift.venueId !== venueId) throw notFound('Shift not found');

  const chequeIds = chequeIdsForShift(shift);
  const [{ voidByCheque, compByCheque }, discountRows, voidRows, compRows] =
    await Promise.all([
      voidCompCountsByChequeIds(chequeIds),
      chequeIds.length
        ? prisma.chequeDiscountAudit.findMany({
            where: { chequeId: { in: chequeIds } },
            include: {
              cheque: { select: { chequeNumber: true, tableLabel: true } },
              initiator: { select: { username: true } },
              approver: { select: { username: true } },
            },
            orderBy: { createdAt: 'asc' },
          })
        : Promise.resolve([]),
      chequeIds.length
        ? prisma.orderVoidAudit.findMany({
            where: { order: { chequeLink: { chequeId: { in: chequeIds } } } },
            include: {
              order: { select: { orderNumber: true, tableLabel: true } },
              cashier: { select: { username: true } },
              approver: { select: { username: true } },
            },
            orderBy: { createdAt: 'asc' },
          })
        : Promise.resolve([]),
      chequeIds.length
        ? prisma.orderItemCompAudit.findMany({
            where: { chequeId: { in: chequeIds } },
            include: {
              cheque: { select: { chequeNumber: true, tableLabel: true } },
              orderItem: { include: { menuItem: { select: { nameEn: true } } } },
              approver: { select: { username: true } },
            },
            orderBy: { createdAt: 'asc' },
          })
        : Promise.resolve([]),
    ]);

  const voidCount = sumCountsForCheques(chequeIds, voidByCheque);
  const compCount = sumCountsForCheques(chequeIds, compByCheque);
  const report = buildShiftReport(shift, shift.payments, shift.refunds);

  return {
    ...serializeShiftListRow(shift, { voidCount, compCount }),
    report,
    payments: shift.payments.map(serializePaymentRow),
    refunds: shift.refunds.map(serializeRefundRow),
    discounts: discountRows.map(serializeDiscountRow),
    voids: voidRows.map(serializeVoidRow),
    comps: compRows.map(serializeCompRow),
  };
}

export async function managerForceCloseShift(shiftId, body, venueId) {
  return forceCloseShiftById(shiftId, body, venueId);
}

const SHIFTS_LIST_CSV_HEADER =
  'cashier,terminal,venue,status,open_float,expected_cash,close_float,over_short,total_revenue,total_refunds,cash_payments,card_payments,voucher_payments,cash_refunds,card_refunds,voucher_refunds,discount_total,discount_count,payment_count,refund_count,void_count,comp_count,opened_at,closed_at';

function shiftListCsvRow(row) {
  return [
    csvEscape(row.cashierUsername),
    csvEscape(row.terminalName),
    csvEscape(row.venueNameEn),
    row.status,
    row.openFloat,
    row.expectedCash ?? '',
    row.closeFloat ?? '',
    row.overShortAmount ?? '',
    row.totalRevenue,
    row.totalRefunds ?? 0,
    row.paymentsByMethod?.cash ?? 0,
    row.paymentsByMethod?.card ?? 0,
    row.paymentsByMethod?.voucher ?? 0,
    row.refundsByMethod?.cash ?? 0,
    row.refundsByMethod?.card ?? 0,
    row.refundsByMethod?.voucher ?? 0,
    row.discountTotal ?? 0,
    row.discountCount ?? 0,
    row.paymentCount ?? 0,
    row.refundCount ?? 0,
    row.voidCount ?? 0,
    row.compCount ?? 0,
    row.openedAt,
    row.closedAt ?? '',
  ].join(',');
}

export function shiftsListToCsv(result) {
  const lines = [SHIFTS_LIST_CSV_HEADER];
  const venueTotals = new Map();

  for (const row of result.shifts) {
    lines.push(shiftListCsvRow(row));
    const key = row.venueId;
    if (!venueTotals.has(key)) {
      venueTotals.set(key, {
        venueNameEn: row.venueNameEn,
        shiftCount: 0,
        totalRevenue: 0,
        totalRefunds: 0,
        overShort: 0,
        discountTotal: 0,
        paymentCount: 0,
        refundCount: 0,
        voidCount: 0,
        compCount: 0,
      });
    }
    const totals = venueTotals.get(key);
    totals.shiftCount += 1;
    totals.totalRevenue += row.totalRevenue ?? 0;
    totals.totalRefunds += row.totalRefunds ?? 0;
    if (row.overShortAmount != null) totals.overShort += row.overShortAmount;
    totals.discountTotal += row.discountTotal ?? 0;
    totals.paymentCount += row.paymentCount ?? 0;
    totals.refundCount += row.refundCount ?? 0;
    totals.voidCount += row.voidCount ?? 0;
    totals.compCount += row.compCount ?? 0;
  }

  if (venueTotals.size > 1) {
    lines.push('');
    lines.push('VENUE TOTALS');
    lines.push(
      'venue,shift_count,total_revenue,total_refunds,over_short,discount_total,payment_count,refund_count,void_count,comp_count',
    );
    for (const totals of venueTotals.values()) {
      lines.push(
        [
          csvEscape(totals.venueNameEn),
          totals.shiftCount,
          Number(totals.totalRevenue.toFixed(2)),
          Number(totals.totalRefunds.toFixed(2)),
          Number(totals.overShort.toFixed(2)),
          Number(totals.discountTotal.toFixed(2)),
          totals.paymentCount,
          totals.refundCount,
          totals.voidCount,
          totals.compCount,
        ].join(','),
      );
    }
  }

  return lines.join('\n');
}

export function shiftDetailToCsv(detail) {
  const lines = [
    'SHIFT SUMMARY',
    'field,value',
    `venue,${csvEscape(detail.venueNameEn)}`,
    `cashier,${csvEscape(detail.cashierUsername)}`,
    `terminal,${csvEscape(detail.terminalName)}`,
    `status,${detail.status}`,
    `open_float,${detail.openFloat}`,
    `close_float,${detail.closeFloat ?? ''}`,
    `expected_cash,${detail.expectedCash ?? ''}`,
    `over_short,${detail.overShortAmount ?? ''}`,
    `total_revenue,${detail.totalRevenue}`,
    `total_refunds,${detail.totalRefunds}`,
    `discount_total,${detail.discountTotal}`,
    `discount_count,${detail.discountCount}`,
    `payment_count,${detail.paymentCount}`,
    `refund_count,${detail.refundCount}`,
    `void_count,${detail.voidCount ?? 0}`,
    `comp_count,${detail.compCount ?? 0}`,
    `cash_payments,${detail.paymentsByMethod?.cash ?? 0}`,
    `card_payments,${detail.paymentsByMethod?.card ?? 0}`,
    `voucher_payments,${detail.paymentsByMethod?.voucher ?? 0}`,
    `cash_refunds,${detail.refundsByMethod?.cash ?? 0}`,
    `card_refunds,${detail.refundsByMethod?.card ?? 0}`,
    `voucher_refunds,${detail.refundsByMethod?.voucher ?? 0}`,
    `opened_at,${detail.openedAt}`,
    `closed_at,${detail.closedAt ?? ''}`,
    '',
    'PAYMENTS',
    'cheque_number,table,method,amount,processed_at',
  ];

  for (const p of detail.payments ?? []) {
    lines.push(
      [p.chequeNumber, csvEscape(p.tableLabel), p.method, p.amount, p.processedAt].join(','),
    );
  }

  lines.push('', 'REFUNDS', 'cheque_number,table,method,amount,reason,initiator,approver,processed_at');
  for (const r of detail.refunds ?? []) {
    lines.push(
      [
        r.chequeNumber,
        csvEscape(r.tableLabel),
        r.method,
        r.amount,
        csvEscape(r.reason),
        csvEscape(r.initiatorUsername),
        csvEscape(r.approverUsername),
        r.processedAt,
      ].join(','),
    );
  }

  lines.push(
    '',
    'DISCOUNTS',
    'cheque_number,table,action,amount,percent,reason,initiator,approver,created_at',
  );
  for (const d of detail.discounts ?? []) {
    lines.push(
      [
        d.chequeNumber,
        csvEscape(d.tableLabel),
        d.action,
        d.amount,
        d.percent ?? '',
        csvEscape(d.reason),
        csvEscape(d.initiatorUsername),
        csvEscape(d.approverUsername),
        d.createdAt,
      ].join(','),
    );
  }

  lines.push('', 'VOIDS', 'order_number,table,reason,cashier,approver,created_at');
  for (const v of detail.voids ?? []) {
    lines.push(
      [
        v.orderNumber,
        csvEscape(v.tableLabel ?? ''),
        csvEscape(v.reason),
        csvEscape(v.cashierUsername),
        csvEscape(v.approverUsername),
        v.createdAt,
      ].join(','),
    );
  }

  lines.push('', 'COMPS', 'cheque_number,table,item,reason,approver,created_at');
  for (const c of detail.comps ?? []) {
    lines.push(
      [
        c.chequeNumber,
        csvEscape(c.tableLabel),
        csvEscape(c.itemName),
        csvEscape(c.reason),
        csvEscape(c.approverUsername),
        c.createdAt,
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
    grossRevenue: 0,
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

  // Per-shift totalRevenue is already net (payments − refunds); do not subtract refunds again.
  totals.totalRevenue = Number(totals.totalRevenue.toFixed(2));
  totals.totalRefunds = Number(totals.totalRefunds.toFixed(2));
  totals.netRevenue = totals.totalRevenue;
  totals.grossRevenue = Number((totals.totalRevenue + totals.totalRefunds).toFixed(2));
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

  const voidCompCounts = await enrichShiftsWithVoidCompCounts(shifts);
  const rows = shifts.map((shift, index) =>
    serializeShiftListRow(shift, voidCompCounts[index]),
  );
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
