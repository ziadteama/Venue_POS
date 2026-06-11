/** @param {{ payments?: Array<{ method?: string }>; method?: string }} payBody */
export function paymentIncludesCash(payBody) {
  if (!payBody) return false;
  if (Array.isArray(payBody.payments) && payBody.payments.length) {
    return payBody.payments.some((p) => String(p?.method ?? '').toLowerCase() === 'cash');
  }
  return String(payBody.method ?? '').toLowerCase() === 'cash';
}
