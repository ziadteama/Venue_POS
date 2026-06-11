import { canSeeFinancials } from '@venue-pos/shared';

export function userCanSeeFinancials(user) {
  return canSeeFinancials({ username: user?.username });
}

const ZERO_METHODS = { cash: 0, card: 0, voucher: 0 };

export function redactShiftRowFinancials(row) {
  if (!row || typeof row !== 'object') return row;
  return {
    ...row,
    totalRevenue: null,
    totalRefunds: null,
    discountTotal: null,
    paymentsByMethod: { ...ZERO_METHODS },
    refundsByMethod: { ...ZERO_METHODS },
    report: row.report
      ? {
          ...row.report,
          totalRevenue: null,
          totalRefunds: null,
          discountTotal: null,
          paymentsByMethod: { ...ZERO_METHODS },
          refundsByMethod: { ...ZERO_METHODS },
        }
      : row.report,
  };
}

export function redactEodFinancials(result) {
  if (!result || typeof result !== 'object') return result;
  return {
    ...result,
    totalRevenue: null,
    totalRefunds: null,
    netRevenue: null,
    discountTotal: null,
    paymentsByMethod: { ...ZERO_METHODS },
    refundsByMethod: { ...ZERO_METHODS },
    shifts: Array.isArray(result.shifts)
      ? result.shifts.map(redactShiftRowFinancials)
      : result.shifts,
    venues: Array.isArray(result.venues)
      ? result.venues.map((venue) => ({
          ...venue,
          totalRevenue: null,
          totalRefunds: null,
          netRevenue: null,
          discountTotal: null,
          paymentsByMethod: { ...ZERO_METHODS },
          refundsByMethod: { ...ZERO_METHODS },
        }))
      : result.venues,
  };
}

export function redactShiftListFinancials(result) {
  if (!result || typeof result !== 'object') return result;
  return {
    ...result,
    shifts: Array.isArray(result.shifts)
      ? result.shifts.map(redactShiftRowFinancials)
      : result.shifts,
  };
}

function omitAmount(event) {
  if (!event || typeof event !== 'object') return event;
  const rest = { ...event };
  delete rest.amount;
  return rest;
}

function omitVenueFinancials(venue) {
  if (!venue || typeof venue !== 'object') return venue;
  const rest = { ...venue };
  delete rest.netRevenueToday;
  delete rest.netRevenueWeek;
  delete rest.avgChequeValue;
  delete rest.changePercent;
  delete rest.changeAmount;
  delete rest.weekGrowthPercent;
  return rest;
}

function omitVenueRevenueToday(venue) {
  if (!venue || typeof venue !== 'object') return venue;
  const rest = { ...venue };
  delete rest.revenueToday;
  return rest;
}

export function redactAuditFinancials(result) {
  if (!result || typeof result !== 'object') return result;
  return {
    ...result,
    events: Array.isArray(result.events) ? result.events.map(omitAmount) : result.events,
  };
}

export function redactRefundsTodayList(result) {
  if (!result || typeof result !== 'object') return result;
  return {
    ...result,
    total: null,
    refunds: Array.isArray(result.refunds)
      ? result.refunds.map((row) => ({ ...row, amount: null }))
      : result.refunds,
  };
}

export function redactExecutiveDashboardFinancials(result) {
  if (!result || typeof result !== 'object') return result;

  const redactComparison = () => ({
    previous: null,
    changeAmount: null,
    changePercent: null,
  });

  return {
    ...result,
    summary: result.summary
      ? {
          ...result.summary,
          netSalesToday: null,
          netSalesTodayComparison: redactComparison(),
          netSalesWeek: null,
          netSalesWeekComparison: redactComparison(),
          netSalesMonth: null,
          netSalesMonthComparison: redactComparison(),
          avgTransactionValue: null,
          refundAmountToday: null,
          refundAmountTodayComparison: redactComparison(),
          revenueGrowthPercent: null,
        }
      : result.summary,
    financial: result.financial
      ? {
          refundTrend: [],
          netAfterRefundsWeek: null,
          paymentsByMethod: { ...ZERO_METHODS },
          crossVenueVolume: null,
          crossVenueVolumeComparison: redactComparison(),
        }
      : result.financial,
    ranking: result.ranking
      ? {
          ...result.ranking,
          venues: Array.isArray(result.ranking.venues)
            ? result.ranking.venues.map(omitVenueFinancials)
            : result.ranking.venues,
          topVenue: result.ranking.topVenue
            ? {
                ...result.ranking.topVenue,
                netRevenueToday: null,
                netRevenueWeek: null,
                avgChequeValue: null,
                changePercent: null,
                changeAmount: null,
                weekGrowthPercent: null,
              }
            : null,
          bottomVenue: result.ranking.bottomVenue
            ? {
                ...result.ranking.bottomVenue,
                netRevenueToday: null,
                netRevenueWeek: null,
                avgChequeValue: null,
                changePercent: null,
                changeAmount: null,
                weekGrowthPercent: null,
              }
            : null,
        }
      : result.ranking,
    dailyTrend: [],
    weeklyTrend: [],
    attention: Array.isArray(result.attention)
      ? result.attention.filter(
          (item) =>
            ![
              'revenue-drop-week',
              'revenue-drop-day',
              'refund-spike',
              'cross-venue-growth',
              'no-sales',
            ].includes(item.id),
        )
      : result.attention,
    recentEvents: Array.isArray(result.recentEvents)
      ? result.recentEvents.map(omitAmount)
      : result.recentEvents,
    live: redactLiveMetricsFinancials(result.live),
  };
}

export function redactLiveMetricsFinancials(payload) {
  if (!payload || typeof payload !== 'object') return payload;
  return {
    ...payload,
    totalRevenueToday: null,
    venues: Array.isArray(payload.venues)
      ? payload.venues.map(omitVenueRevenueToday)
      : payload.venues,
  };
}
