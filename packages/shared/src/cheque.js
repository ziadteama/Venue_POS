/** Cheque service mode — dine-in uses hub floor tables; takeaway uses a shared counter. */
export const CHEQUE_SERVICE_MODES = {
  DINE_IN: 'dine_in',
  TAKEAWAY: 'takeaway',
};

/** Internal table label for the single shared takeaway counter per venue. */
export const TAKEAWAY_TABLE_LABEL = 'TAKEAWAY';

export function isTakeawayServiceMode(serviceMode) {
  return serviceMode === CHEQUE_SERVICE_MODES.TAKEAWAY;
}
