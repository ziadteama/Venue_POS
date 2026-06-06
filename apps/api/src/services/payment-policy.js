import { forbidden, validationError } from '../utils/errors.js';
import { verifyManagerPin } from './auth-service.js';

export function cardPaymentTotal(lines) {
  return lines
    .filter((p) => p.method === 'card')
    .reduce((sum, p) => sum + Number(p.amount), 0);
}

export async function assertManualCardPaymentsAllowed(
  lines,
  { manualCardEnabled, approvalThreshold, managerPin, venueId },
) {
  const cardTotal = cardPaymentTotal(lines);
  if (cardTotal <= 0) return;

  if (!manualCardEnabled) {
    throw forbidden('Manual card payments are disabled for this deployment');
  }

  if (cardTotal >= approvalThreshold) {
    if (!managerPin) {
      throw validationError('Manager approval required for card payments above threshold');
    }
    await verifyManagerPin(venueId, managerPin);
  }
}
