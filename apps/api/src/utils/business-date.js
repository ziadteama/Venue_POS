/** UTC calendar date used for per-day order/cheque numbering. */
export function resolveBusinessDate(at = new Date()) {
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
}
