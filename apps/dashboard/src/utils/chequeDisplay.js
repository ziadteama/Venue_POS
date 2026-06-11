import { TAKEAWAY_TABLE_LABEL, isTakeawayServiceMode } from '@venue-pos/shared';

export function chequeTableLabel(cheque, t) {
  if (isTakeawayServiceMode(cheque?.serviceMode) || cheque?.tableLabel === TAKEAWAY_TABLE_LABEL) {
    return t('orders.takeAway');
  }
  if (cheque?.splitLabel) {
    return `${cheque.tableLabel} (${cheque.splitLabel})`;
  }
  return cheque?.tableLabel ?? '—';
}
