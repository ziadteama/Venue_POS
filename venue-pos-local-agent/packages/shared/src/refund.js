export const REFUND_METHODS = ['cash', 'card', 'voucher'];

export function summarizeRefundable(cheque) {
  const payments = cheque?.payments ?? [];
  const refunds = cheque?.refunds ?? [];

  const paidByMethod = Object.fromEntries(REFUND_METHODS.map((m) => [m, 0]));
  const refundedByMethod = Object.fromEntries(REFUND_METHODS.map((m) => [m, 0]));

  for (const p of payments) {
    if (paidByMethod[p.method] != null) {
      paidByMethod[p.method] += Number(p.amount);
    }
  }
  for (const r of refunds) {
    if (refundedByMethod[r.method] != null) {
      refundedByMethod[r.method] += Number(r.amount);
    }
  }

  const methods = REFUND_METHODS.map((method) => ({
    method,
    paid: paidByMethod[method],
    refunded: refundedByMethod[method],
    remaining: Math.max(0, paidByMethod[method] - refundedByMethod[method]),
  })).filter((row) => row.paid > 0.009);

  const paidTotal = payments.reduce((s, p) => s + Number(p.amount), 0);
  const refundedTotal = refunds.reduce((s, r) => s + Number(r.amount), 0);

  return {
    paidTotal,
    refundedTotal,
    remainingTotal: Math.max(0, paidTotal - refundedTotal),
    methods,
  };
}

export function defaultRefundMethod(summary) {
  return summary.methods.find((m) => m.remaining > 0.009)?.method ?? 'cash';
}

export function remainingForMethod(summary, method) {
  return summary.methods.find((m) => m.method === method)?.remaining ?? 0;
}
