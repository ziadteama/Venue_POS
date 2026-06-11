import { getCachedShift } from './shift-cache.js';
import { isCashDrawerEnabled, openCashDrawer } from './receipt-printer.js';
import { paymentIncludesCash } from './payment-tender.js';

export { paymentIncludesCash };

export function hasActiveShift(db, cashierId) {
  const shift = getCachedShift(db, cashierId);
  if (!shift) return false;
  if (shift.status === 'closed') return false;
  return Boolean(shift.id || shift.openedAt || shift.active);
}

/** Fire-and-forget drawer kick after successful pay when tender includes cash. */
export function openDrawerIfCashPayment(payBody, log, printerOpts = {}) {
  if (!isCashDrawerEnabled() || !paymentIncludesCash(payBody)) return;
  openCashDrawer({ ...printerOpts, log }).catch((err) => log?.warn?.({ err }, 'Pay drawer kick failed'));
}

export async function openCashDrawerManual({ db, cashierId, log, host, port }) {
  if (!isCashDrawerEnabled()) {
    const err = new Error('Cash drawer disabled');
    err.statusCode = 503;
    throw err;
  }
  if (!cashierId) {
    const err = new Error('cashierId required');
    err.statusCode = 400;
    throw err;
  }
  if (!hasActiveShift(db, cashierId)) {
    const err = new Error('No active shift');
    err.statusCode = 403;
    throw err;
  }
  const health = await openCashDrawer({ host, port, log });
  if (!health.opened) {
    const err = new Error(health.reason || 'Drawer open failed');
    err.statusCode = 503;
    throw err;
  }
  log?.info?.({ cashierId, source: 'manual_header' }, 'Cash drawer opened manually');
  return { ok: true };
}
